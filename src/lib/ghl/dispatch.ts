import "server-only";

import { finalizeFollowUpDispatch } from "@/lib/follow-up/finalize";
import { DISPATCH_MAX_ATTEMPTS } from "@/lib/ghl/constants";
import { fetchContact, getValidAccessToken, sendConversationMessage } from "@/lib/ghl/client";
import { ghlError, ghlLog, ghlWarn } from "@/lib/ghl/log";
import {
  contactLookupReady,
  discardedDraftBlocksDispatch,
  draftStatusBlocksSend,
  followUpMissingApprover,
} from "@/lib/ghl/dispatch-guard";
import { channelToGhlType, contactIsSuppressed, outboundTouchSummary } from "@/lib/ghl/message-meta";
import { nextAttemptAt, shouldMarkDead } from "@/lib/ghl/retry";
import type { GhlDb } from "@/lib/ghl/tokens";
import type { Enums } from "@/types/database";

type TouchChannel = Enums<"touch_channel">;

export type DispatchInput = {
  orgId: string;
  leadId: string;
  channel: TouchChannel;
  content: string;
  subject?: string;
  actorMemberId?: string | null;
  idempotencyKey?: string;
  availableAt?: string;
  followUpDraftId?: string;
};

export type DispatchResult =
  | { status: "sent"; dispatchId: string; touchId: string; ghlMessageId: string | null }
  | { status: "queued"; dispatchId: string }
  | { status: "suppressed"; dispatchId: string; reason: string }
  | { status: "failed"; dispatchId: string | null; reason: string }
  | { status: "halted"; reason: "connection_broken" | "connection_missing" };

/**
 * Send through GHL and record the resulting touch.
 * Rate-limit approaching → queue, never drop. Failed send → no touch row.
 * Follow-up drafts must carry a named approver. Cron only drains rows that
 * an operator already approved.
 */
export async function dispatchOutboundMessage(db: GhlDb, input: DispatchInput): Promise<DispatchResult> {
  if (followUpMissingApprover(input)) {
    ghlError("ghl.dispatch.failed", logFields(input, "failed", "missing_approver"));
    return { status: "failed", dispatchId: null, reason: "missing_approver" };
  }

  const token = await getValidAccessToken(db, input.orgId);
  if (!token.ok) {
    ghlError("ghl.dispatch.halted", {
      orgId: input.orgId,
      leadId: input.leadId,
      channel: input.channel,
      actorMemberId: input.actorMemberId ?? null,
      result: "halted",
      reason: token.reason,
    });
    return { status: "halted", reason: token.reason === "missing" ? "connection_missing" : "connection_broken" };
  }

  const ghlType = channelToGhlType(input.channel);
  if (!ghlType) {
    const row = await insertDispatch(db, input, "failed", "unsupported_channel");
    ghlError("ghl.dispatch.failed", logFields(input, "failed", "unsupported_channel"));
    return { status: "failed", dispatchId: row?.id ?? null, reason: "unsupported_channel" };
  }

  const queued = await insertDispatch(db, input, "queued");
  if (!queued) {
    return { status: "failed", dispatchId: null, reason: "dispatch_insert_failed" };
  }
  if (input.followUpDraftId) {
    const { error: linkError } = await db
      .from("follow_up_drafts")
      .update({
        dispatch_id: queued.id,
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by_member_id: input.actorMemberId ?? null,
      })
      .eq("id", input.followUpDraftId)
      .eq("org_id", input.orgId);
    if (linkError) {
      ghlError("ghl.dispatch.draft_link_failed", logFields(input, "failed", "draft_link_failed"));
      return { status: "failed", dispatchId: queued.id, reason: "draft_link_failed" };
    }
  }
  if (queued.status && queued.status !== "queued") {
    ghlLog("ghl.dispatch.duplicate", {
      orgId: input.orgId,
      leadId: input.leadId,
      channel: input.channel,
      actorMemberId: input.actorMemberId ?? null,
      result: queued.status,
    });
    if (queued.status === "sent") {
      return { status: "sent", dispatchId: queued.id, touchId: "", ghlMessageId: null };
    }
    if (queued.status === "suppressed") {
      return { status: "suppressed", dispatchId: queued.id, reason: "already_suppressed" };
    }
    return { status: "failed", dispatchId: queued.id, reason: "already_failed" };
  }
  return sendQueuedDispatch(db, queued.id);
}

export async function drainDispatchQueue(db: GhlDb, limit = 25): Promise<{ sent: number; queued: number; failed: number }> {
  const { data } = await db
    .from("ghl_dispatches")
    .select("id")
    .or(
      "status.eq.queued,and(status.eq.failed,failure_reason.eq.touch_insert_failed)"
    )
    .lte("available_at", new Date().toISOString())
    .order("available_at", { ascending: true })
    .limit(limit);

  let sent = 0;
  let queued = 0;
  let failed = 0;
  for (const row of data ?? []) {
    const result = await sendQueuedDispatch(db, row.id);
    if (result.status === "sent") sent += 1;
    else if (result.status === "queued") queued += 1;
    else failed += 1;
  }
  return { sent, queued, failed };
}

export async function sendQueuedDispatch(db: GhlDb, dispatchId: string): Promise<DispatchResult> {
  const { data: claimed } = await db.rpc("claim_ghl_dispatch", { p_id: dispatchId });
  if (!claimed) {
    const { data: row } = await db.from("ghl_dispatches").select("*").eq("id", dispatchId).maybeSingle();
    if (!row) return { status: "failed", dispatchId, reason: "not_queued" };
    if (row.status === "sent") {
      return { status: "sent", dispatchId: row.id, touchId: "", ghlMessageId: row.ghl_message_id };
    }
    if (row.status === "suppressed") {
      return { status: "suppressed", dispatchId: row.id, reason: row.failure_reason ?? "already_suppressed" };
    }
    if (Date.parse(row.available_at) > Date.now()) {
      return { status: "queued", dispatchId: row.id };
    }
    ghlLog("ghl.dispatch.claim_skipped", logFieldsFromRow(row as DatabaseRow, "queued", "lease_held"));
    return { status: "queued", dispatchId: row.id };
  }
  const row = claimed as DatabaseRow;

  if (row.status === "failed" && row.failure_reason === "touch_insert_failed" && row.ghl_message_id) {
    return recoverTouchAfterSend(db, row);
  }
  if (row.status !== "queued") {
    return { status: "failed", dispatchId, reason: "not_queued" };
  }
  if (Date.parse(row.available_at) > Date.now()) {
    await db.from("ghl_dispatches").update({ claimed_at: null }).eq("id", row.id);
    return { status: "queued", dispatchId: row.id };
  }

  const haltReason = await haltReasonForDispatch(db, row);
  if (haltReason) return failDispatch(db, row, haltReason);

  const token = await getValidAccessToken(db, row.org_id);
  if (!token.ok) {
    await db
      .from("ghl_dispatches")
      .update({ status: "failed", failure_reason: "connection_broken", body_text: null, claimed_at: null })
      .eq("id", row.id);
    ghlError("ghl.dispatch.halted", {
      orgId: row.org_id,
      leadId: row.lead_id,
      channel: row.channel,
      actorMemberId: row.actor_member_id,
      result: "halted",
      reason: token.reason,
    });
    return finishDispatch(db, row, { status: "halted", reason: "connection_broken" });
  }

  const { data: allowed } = await db.rpc("try_consume_ghl_rate", { p_org_id: row.org_id });
  if (allowed === false) {
    await db
      .from("ghl_dispatches")
      .update({
        available_at: nextAttemptAt(Math.max(row.attempt_count, 1)),
        claimed_at: null,
      })
      .eq("id", row.id);
    ghlLog("ghl.dispatch.queued", logFieldsFromRow(row, "queued", "rate_limited"));
    return { status: "queued", dispatchId: row.id };
  }

  const { data: lead } = await db
    .from("leads")
    .select("id, ghl_contact_id")
    .eq("id", row.lead_id)
    .eq("org_id", row.org_id)
    .maybeSingle();
  if (!lead?.ghl_contact_id) {
    return failDispatch(db, row, "missing_ghl_contact");
  }

  const contactResult = await fetchContact(db, row.org_id, lead.ghl_contact_id);
  if (!contactLookupReady(contactResult)) {
    return retryOrFail(db, row, `contact_lookup_failed:${contactResult.status}`);
  }
  const contact = contactResult.json?.contact ?? {};
  const channel = row.channel === "sms" || row.channel === "email" || row.channel === "dm" ? row.channel : null;
  if (!channel) return failDispatch(db, row, "unsupported_channel");
  const suppressed = contactIsSuppressed(contact, channel);
  if (suppressed) {
    await db
      .from("ghl_dispatches")
      .update({ status: "suppressed", failure_reason: suppressed, body_text: null, sent_at: new Date().toISOString() })
      .eq("id", row.id);
    ghlLog("ghl.dispatch.suppressed", logFieldsFromRow(row, "suppressed", suppressed));
    return finishDispatch(db, row, { status: "suppressed", dispatchId: row.id, reason: suppressed });
  }

  const ghlType = channelToGhlType(row.channel);
  if (!ghlType) return failDispatch(db, row, "unsupported_channel");
  if (!row.body_text) return failDispatch(db, row, "missing_body");

  const body: Record<string, unknown> = {
    type: ghlType,
    contactId: lead.ghl_contact_id,
    message: row.body_text,
  };
  if (ghlType === "Email") {
    body.html = row.body_text;
    body.subject = row.email_subject ?? "Message";
  }

  const sent = await sendConversationMessage(db, row.org_id, body);
  if (!sent.ok) {
    return retryOrFail(db, row, `ghl_${sent.status}`);
  }

  const ghlMessageId = sent.json?.messageId ?? sent.json?.message?.id ?? null;

  if (ghlMessageId) {
    const { data: existingTouch } = await db
      .from("touches")
      .select("id")
      .eq("org_id", row.org_id)
      .eq("ghl_message_id", ghlMessageId)
      .maybeSingle();
    if (existingTouch) {
      if (row.body_text) {
        await db
          .from("touches")
          .update({
            outbound_body: row.body_text,
            actor_member_id: row.actor_member_id,
            type: row.actor_member_id ? "human" : "system",
          })
          .eq("id", existingTouch.id)
          .eq("org_id", row.org_id)
          .eq("direction", "outbound");
      }
      await db
        .from("ghl_dispatches")
        .update({
          status: "sent",
          ghl_message_id: ghlMessageId,
          body_text: null,
          sent_at: new Date().toISOString(),
          failure_reason: null,
        })
        .eq("id", row.id);
      ghlLog("ghl.dispatch.sent", logFieldsFromRow(row, "sent", "echo_exists"));
      return finishDispatch(db, row, {
        status: "sent",
        dispatchId: row.id,
        touchId: existingTouch.id,
        ghlMessageId,
      });
    }
  }

  const type = row.actor_member_id ? "human" : "system";
  const { data: touch, error } = await db
    .from("touches")
    .insert({
      org_id: row.org_id,
      lead_id: row.lead_id,
      type,
      channel: row.channel,
      direction: "outbound",
      actor_member_id: row.actor_member_id,
      summary: outboundTouchSummary(row.channel, type),
      ghl_message_id: ghlMessageId,
      outbound_body: row.body_text,
    })
    .select("id")
    .maybeSingle();

  if (error?.code === "23505" && ghlMessageId) {
    const { data: raced } = await db
      .from("touches")
      .select("id")
      .eq("org_id", row.org_id)
      .eq("ghl_message_id", ghlMessageId)
      .maybeSingle();
    await db
      .from("ghl_dispatches")
      .update({
        status: "sent",
        ghl_message_id: ghlMessageId,
        body_text: null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return finishDispatch(db, row, {
      status: "sent",
      dispatchId: row.id,
      touchId: raced?.id ?? "",
      ghlMessageId,
    });
  }

  if (error || !touch) {
    await db
      .from("ghl_dispatches")
      .update({
        status: "failed",
        ghl_message_id: ghlMessageId,
        sent_at: new Date().toISOString(),
        failure_reason: "touch_insert_failed",
        claimed_at: null,
      })
      .eq("id", row.id);
    ghlError("ghl.dispatch.touch_missing", logFieldsFromRow(row, "failed", "touch_insert_failed"));
    return finishDispatch(db, row, { status: "failed", dispatchId: row.id, reason: "touch_insert_failed" });
  }

  await db
    .from("ghl_dispatches")
    .update({
      status: "sent",
      ghl_message_id: ghlMessageId,
      body_text: null,
      sent_at: new Date().toISOString(),
      failure_reason: null,
    })
    .eq("id", row.id);

  ghlLog("ghl.dispatch.sent", logFieldsFromRow(row, "sent"));
  return finishDispatch(db, row, {
    status: "sent",
    dispatchId: row.id,
    touchId: touch.id,
    ghlMessageId,
  });
}

async function recoverTouchAfterSend(
  db: GhlDb,
  row: DatabaseRow & { ghl_message_id: string | null; channel: TouchChannel }
): Promise<DispatchResult> {
  const ghlMessageId = row.ghl_message_id;
  if (!ghlMessageId) {
    return { status: "failed", dispatchId: row.id, reason: "touch_insert_failed" };
  }

  const { data: existingTouch } = await db
    .from("touches")
    .select("id")
    .eq("org_id", row.org_id)
    .eq("ghl_message_id", ghlMessageId)
    .maybeSingle();
  if (existingTouch) {
    await db
      .from("ghl_dispatches")
      .update({ status: "sent", failure_reason: null, body_text: null })
      .eq("id", row.id);
    return finishDispatch(db, row, {
      status: "sent",
      dispatchId: row.id,
      touchId: existingTouch.id,
      ghlMessageId,
    });
  }

  const type = row.actor_member_id ? "human" : "system";
  const { data: touch, error } = await db
    .from("touches")
    .insert({
      org_id: row.org_id,
      lead_id: row.lead_id,
      type,
      channel: row.channel,
      direction: "outbound",
      actor_member_id: row.actor_member_id,
      summary: outboundTouchSummary(row.channel, type),
      ghl_message_id: ghlMessageId,
      outbound_body: row.body_text,
    })
    .select("id")
    .maybeSingle();

  if (error || !touch) {
    return finishDispatch(db, row, { status: "failed", dispatchId: row.id, reason: "touch_insert_failed" });
  }

  await db
    .from("ghl_dispatches")
    .update({ status: "sent", failure_reason: null, body_text: null })
    .eq("id", row.id);
  return finishDispatch(db, row, {
    status: "sent",
    dispatchId: row.id,
    touchId: touch.id,
    ghlMessageId,
  });
}

async function insertDispatch(
  db: GhlDb,
  input: DispatchInput,
  status: "queued" | "failed",
  reason?: string
) {
  const { data, error } = await db
    .from("ghl_dispatches")
    .insert({
      org_id: input.orgId,
      lead_id: input.leadId,
      channel: input.channel,
      body_text: status === "queued" ? input.content : null,
      email_subject: input.subject ?? null,
      actor_member_id: input.actorMemberId ?? null,
      status,
      failure_reason: reason ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      available_at: input.availableAt ?? undefined,
    })
    .select("id, status")
    .maybeSingle();
  if (error?.code === "23505" && input.idempotencyKey) {
    const { data: existing } = await db
      .from("ghl_dispatches")
      .select("id, status")
      .eq("org_id", input.orgId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing?.status === "failed") {
      await db
        .from("ghl_dispatches")
        .update({
          status: "queued",
          body_text: input.content,
          email_subject: input.subject ?? null,
          failure_reason: null,
          claimed_at: null,
          available_at: input.availableAt ?? new Date().toISOString(),
          actor_member_id: input.actorMemberId ?? null,
        })
        .eq("id", existing.id)
        .eq("org_id", input.orgId);
      return { id: existing.id, status: "queued" };
    }
    return existing;
  }
  if (error) {
    ghlWarn("ghl.dispatch.insert_failed", { orgId: input.orgId, code: error.code });
    return null;
  }
  return data;
}

async function retryOrFail(
  db: GhlDb,
  row: DatabaseRow,
  reason: string
): Promise<DispatchResult> {
  const attempts = row.attempt_count + 1;
  if (!shouldMarkDead(attempts, DISPATCH_MAX_ATTEMPTS)) {
    await db
      .from("ghl_dispatches")
      .update({
        attempt_count: attempts,
        available_at: nextAttemptAt(attempts),
        failure_reason: reason,
        claimed_at: null,
      })
      .eq("id", row.id);
    ghlWarn("ghl.dispatch.retry", logFieldsFromRow(row, "queued", reason));
    return { status: "queued", dispatchId: row.id };
  }
  return failDispatch(db, row, reason);
}

async function failDispatch(db: GhlDb, row: DatabaseRow, reason: string): Promise<DispatchResult> {
  await db
    .from("ghl_dispatches")
    .update({
      status: "failed",
      failure_reason: reason,
      body_text: null,
      claimed_at: null,
      attempt_count: row.attempt_count + 1,
    })
    .eq("id", row.id);
  ghlError("ghl.dispatch.failed", logFieldsFromRow(row, "failed", reason));
  return finishDispatch(db, row, { status: "failed", dispatchId: row.id, reason });
}

async function finishDispatch(db: GhlDb, row: DatabaseRow, result: DispatchResult): Promise<DispatchResult> {
  await finalizeFollowUpDispatch(db, {
    dispatchId: row.id,
    result,
    body: row.body_text,
    subject: row.email_subject,
  });
  return result;
}

type DatabaseRow = {
  id: string;
  org_id: string;
  lead_id: string;
  channel: TouchChannel;
  actor_member_id: string | null;
  attempt_count: number;
  available_at: string;
  created_at?: string;
  body_text: string | null;
  email_subject: string | null;
  ghl_message_id: string | null;
  failure_reason: string | null;
  claimed_at: string | null;
  status: "queued" | "sent" | "failed" | "suppressed";
};

async function haltReasonForDispatch(db: GhlDb, row: DatabaseRow): Promise<string | null> {
  const { data: settings } = await db
    .from("follow_up_settings")
    .select("sequences_halted")
    .eq("org_id", row.org_id)
    .maybeSingle();
  if (settings?.sequences_halted) return "sequences_halted";

  const { data: linked } = await db
    .from("follow_up_drafts")
    .select("status")
    .eq("dispatch_id", row.id)
    .eq("org_id", row.org_id)
    .maybeSingle();
  if (draftStatusBlocksSend(linked?.status)) return "sequence_halted";

  const createdAt = row.created_at ?? row.available_at;
  const { data: discarded } = await db
    .from("follow_up_drafts")
    .select("updated_at")
    .eq("org_id", row.org_id)
    .eq("lead_id", row.lead_id)
    .eq("status", "discarded")
    .in("discarded_reason", ["inbound_reply", "suppressed", "org_stop"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (
    discardedDraftBlocksDispatch({
      dispatchCreatedAt: createdAt,
      discardedUpdatedAt: discarded?.updated_at ?? null,
    })
  ) {
    return "sequence_halted";
  }
  return null;
}

function logFields(input: DispatchInput, result: string, reason?: string) {
  return {
    orgId: input.orgId,
    leadId: input.leadId,
    channel: input.channel,
    actorMemberId: input.actorMemberId ?? null,
    result,
    reason: reason ?? null,
  };
}

function logFieldsFromRow(row: DatabaseRow, result: string, reason?: string) {
  return {
    orgId: row.org_id,
    leadId: row.lead_id,
    channel: row.channel,
    actorMemberId: row.actor_member_id,
    result,
    reason: reason ?? null,
  };
}
