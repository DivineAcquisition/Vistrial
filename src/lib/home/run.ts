import "server-only";

import { requireConfig } from "@/lib/config/server";
import { computeSendAt } from "@/lib/follow-up/quiet-hours";
import { dispatchOutboundMessage } from "@/lib/ghl/dispatch";
import type { GhlDb } from "@/lib/ghl/tokens";
import { loadGateState, type GateLimits } from "@/lib/home/gate";
import { zonedStartOfDay } from "@/lib/home/periods";
import { isDone, parseDrafts, type DraftResult, type QueueDraft } from "@/lib/home/queue";
import type { Json } from "@/types/database";

export type RunActor = { memberId: string; name: string } | null;

export type RunOutcome =
  | { ok: true; status: "succeeded" | "failed"; done: number; failed: number; failureReason: string | null }
  | { ok: false; error: string };

const HALT_MESSAGES: Record<string, string> = {
  connection_missing: "The CRM is not connected, so nothing was sent.",
  connection_broken: "The CRM connection is broken, so nothing was sent.",
};

function localHourParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day") };
}

/** Messages Vistrial has sent or queued to this lead since local midnight. */
export async function sendsToday(db: GhlDb, orgId: string, leadId: string, timeZone: string, now = new Date()) {
  const today = localHourParts(now, timeZone);
  const midnight = zonedStartOfDay(timeZone, today.year, today.month, today.day).toISOString();
  const { count } = await db
    .from("ghl_dispatches")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("lead_id", leadId)
    .in("status", ["queued", "sent"])
    .gte("created_at", midnight);
  return count ?? 0;
}

/** When a message may go out: now, or the end of the workspace's quiet hours. */
export function sendTimeFor(limits: GateLimits, timeZone: string, now = new Date()): string {
  return computeSendAt({
    now,
    timeZone,
    enabled: true,
    startHm: limits.quietHoursStart,
    endHm: limits.quietHoursEnd,
  }).toISOString();
}

async function runDraft(
  db: GhlDb,
  args: {
    orgId: string;
    itemId: string;
    draft: QueueDraft;
    actor: RunActor;
    assignedMemberId: string | null;
    sendAt: string;
  }
): Promise<DraftResult> {
  const at = new Date().toISOString();
  if (args.draft.channel === "task") {
    const { error } = await db.from("next_actions").insert({
      org_id: args.orgId,
      lead_id: args.draft.leadId,
      action_text: args.draft.body,
      created_by: "system",
      kind: "nudge",
      owner_member_id: args.assignedMemberId,
    });
    return error ? { status: "failed", reason: "Could not add the task to this lead.", at } : { status: "sent", at };
  }

  const body = args.draft.body.trim();
  if (!body) return { status: "failed", reason: "The message is empty.", at };
  if (args.draft.channel === "email" && !args.draft.subject?.trim()) {
    return { status: "failed", reason: "Email needs a subject.", at };
  }
  const result = await dispatchOutboundMessage(db, {
    orgId: args.orgId,
    leadId: args.draft.leadId,
    channel: args.draft.channel,
    content: body,
    subject: args.draft.subject ?? undefined,
    actorMemberId: args.actor?.memberId ?? null,
    idempotencyKey: `approval:${args.itemId}:${args.draft.leadId}`,
    availableAt: args.sendAt,
  });
  if (result.status === "sent") return { status: "sent", at };
  if (result.status === "queued") return { status: "scheduled", at, sendAt: args.sendAt };
  if (result.status === "suppressed") {
    const reason =
      result.reason === "opted_out"
        ? "This lead replied with an opt-out word. Nothing was sent."
        : "The CRM reports this contact as opted out. Nothing was sent.";
    return { status: "skipped", reason, at };
  }
  if (result.status === "halted") return { status: "failed", reason: HALT_MESSAGES[result.reason], at };
  if (result.reason === "config_incomplete") {
    return { status: "failed", reason: "Nothing was sent: this workspace's configuration needs attention first.", at };
  }
  return { status: "failed", reason: `Send failed (${result.reason.replaceAll("_", " ")}).`, at };
}

/**
 * Runs whatever in an item has not gone out yet. This is the only path that
 * sends anything from the queue, and it only runs for an item a person just
 * approved or one whose action type the workspace set to auto-run.
 *
 * The item is claimed first, so two people approving at once send once.
 * A partial failure leaves the item in the queue as failed with only the
 * unsent leads left to retry. Every message gets a touch on its lead when the
 * CRM confirms it, through the same dispatch path the rest of the app uses.
 */
export async function runApprovalItem(
  db: GhlDb,
  args: {
    orgId: string;
    itemId: string;
    runMode: "approved" | "auto_run";
    actor: RunActor;
    timeZone: string;
    now?: Date;
  }
): Promise<RunOutcome> {
  if (args.runMode === "approved" && !args.actor) {
    return { ok: false, error: "A named person has to approve this." };
  }
  const configured = await requireConfig(db, args.orgId, "approval_queue");
  if (!configured.ok) return { ok: false, error: configured.reason };
  const { data: claimed } = await db
    .from("approval_items")
    .update({ status: "running" })
    .eq("id", args.itemId)
    .eq("org_id", args.orgId)
    .in("status", ["pending", "failed"])
    .select("id, kind, action_type, area, drafts, lead_ids, assigned_member_id, attempt_count")
    .maybeSingle();
  if (!claimed) return { ok: false, error: "This was already handled, or someone else is running it." };

  const gate = await loadGateState(db, args.orgId);
  const sendAt = sendTimeFor(gate.limits, args.timeZone, args.now);
  const drafts = parseDrafts(claimed.drafts);
  const results: QueueDraft[] = [];

  for (const draft of drafts) {
    if (isDone(draft)) {
      results.push(draft);
      continue;
    }
    if (args.runMode === "auto_run" && draft.channel !== "task") {
      const sent = await sendsToday(db, args.orgId, draft.leadId, args.timeZone, args.now);
      if (sent >= gate.limits.dailySendLimitPerLead) {
        results.push({
          ...draft,
          result: {
            status: "failed",
            reason: `Held back: this lead already got ${sent} messages today, the daily limit.`,
            at: new Date().toISOString(),
          },
        });
        continue;
      }
    }
    const result = await runDraft(db, {
      orgId: args.orgId,
      itemId: args.itemId,
      draft,
      actor: args.actor,
      assignedMemberId: claimed.assigned_member_id,
      sendAt,
    });
    results.push({ ...draft, result });
  }

  const failed = results.filter((draft) => draft.result?.status === "failed");
  const newlyDone = results.filter(
    (draft, index) => isDone(draft) && !isDone(drafts[index]) && draft.result?.status !== "skipped"
  );
  const status = failed.length ? "failed" : "succeeded";
  const failureReason = failed.length
    ? failed.length === results.length
      ? (failed[0].result?.reason ?? "Nothing went out.")
      : `${failed.length} of ${results.length} did not go out. ${failed[0].result?.reason ?? ""}`.trim()
    : null;
  const decidedAt = new Date().toISOString();

  const { error: saveError } = await db
    .from("approval_items")
    .update({
      status,
      drafts: results as unknown as Json,
      run_mode: args.runMode,
      decided_by_member_id: args.actor?.memberId ?? null,
      decided_at: decidedAt,
      failure_reason: failureReason,
      attempt_count: claimed.attempt_count + 1,
    })
    .eq("id", args.itemId)
    .eq("org_id", args.orgId);
  if (saveError) {
    // Sends already happened; their idempotency keys stop a retry doubling them.
    await db.from("approval_items").update({ status: "failed", failure_reason: "Could not save the result." }).eq("id", args.itemId);
  }

  if (newlyDone.length) {
    const leadIds = newlyDone.map((draft) => draft.leadId);
    await db.from("agent_events").insert({
      org_id: args.orgId,
      lead_id: leadIds.length === 1 ? leadIds[0] : null,
      actor: "vistrial",
      action_taken: claimed.action_type,
      occurred_at: decidedAt,
      input: { itemId: args.itemId, kind: claimed.kind, area: claimed.area } as Json,
      output: {
        runMode: args.runMode,
        approvedByMemberId: args.actor?.memberId ?? null,
        approvedByName: args.actor?.name ?? null,
        assignedMemberId: claimed.assigned_member_id,
        count: newlyDone.length,
        leadIds,
        scheduled: newlyDone.filter((draft) => draft.result?.status === "scheduled").length,
      } as Json,
    });
  }

  return { ok: true, status, done: newlyDone.length, failed: failed.length, failureReason };
}
