import "server-only";

import { DISPATCH_MAX_ATTEMPTS } from "@/lib/ghl/constants";
import { fetchContact, getValidAccessToken, sendConversationMessage } from "@/lib/ghl/client";
import { ghlError, ghlLog, ghlWarn } from "@/lib/ghl/log";
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
};

export type DispatchResult =
  | { status: "sent"; dispatchId: string; touchId: string; ghlMessageId: string | null }
  | { status: "queued"; dispatchId: string }
  | { status: "suppressed"; dispatchId: string; reason: string }
  | { status: "failed"; dispatchId: string | null; reason: string }
  | { status: "halted"; reason: "connection_broken" | "connection_missing" };

/**
 * Send through GHL and record the resulting touch. No UI calls this yet.
 * Rate-limit approaching → queue, never drop. Failed send → no touch row.
 */
export async function dispatchOutboundMessage(db: GhlDb, input: DispatchInput): Promise<DispatchResult> {
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
    .eq("status", "queued")
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
  const { data: row } = await db.from("ghl_dispatches").select("*").eq("id", dispatchId).maybeSingle();
  if (!row || row.status !== "queued") {
    return { status: "failed", dispatchId, reason: "not_queued" };
  }

  const token = await getValidAccessToken(db, row.org_id);
  if (!token.ok) {
    await db
      .from("ghl_dispatches")
      .update({ status: "failed", failure_reason: "connection_broken", body_text: null })
      .eq("id", row.id);
    ghlError("ghl.dispatch.halted", {
      orgId: row.org_id,
      leadId: row.lead_id,
      channel: row.channel,
      actorMemberId: row.actor_member_id,
      result: "halted",
      reason: token.reason,
    });
    return { status: "halted", reason: "connection_broken" };
  }

  const { data: allowed } = await db.rpc("try_consume_ghl_rate", { p_org_id: row.org_id });
  if (allowed === false) {
    await db
      .from("ghl_dispatches")
      .update({ available_at: nextAttemptAt(Math.max(row.attempt_count, 1)) })
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
    return { status: "suppressed", dispatchId: row.id, reason: suppressed };
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
      return { status: "sent", dispatchId: row.id, touchId: existingTouch.id, ghlMessageId };
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
    return { status: "sent", dispatchId: row.id, touchId: raced?.id ?? "", ghlMessageId };
  }

  if (error || !touch) {
    // Message went out. Record dispatch as sent; do not invent a second send.
    await db
      .from("ghl_dispatches")
      .update({
        status: "sent",
        ghl_message_id: ghlMessageId,
        body_text: null,
        sent_at: new Date().toISOString(),
        failure_reason: "touch_insert_failed",
      })
      .eq("id", row.id);
    ghlError("ghl.dispatch.touch_missing", logFieldsFromRow(row, "sent", "touch_insert_failed"));
    return { status: "sent", dispatchId: row.id, touchId: "", ghlMessageId };
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
  return { status: "sent", dispatchId: row.id, touchId: touch.id, ghlMessageId };
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
      attempt_count: row.attempt_count + 1,
    })
    .eq("id", row.id);
  ghlError("ghl.dispatch.failed", logFieldsFromRow(row, "failed", reason));
  return { status: "failed", dispatchId: row.id, reason };
}

type DatabaseRow = {
  id: string;
  org_id: string;
  lead_id: string;
  channel: TouchChannel;
  actor_member_id: string | null;
  attempt_count: number;
  body_text: string | null;
  email_subject: string | null;
};

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
