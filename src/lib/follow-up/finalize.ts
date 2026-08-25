import "server-only";

import { enqueueSequenceStep } from "@/lib/follow-up/generate";
import { followUpLog, followUpWarn } from "@/lib/follow-up/log";
import { boundedSequenceSteps, parseRoutingRule } from "@/lib/follow-up/routing";
import type { FollowUpBranch, FollowUpChannel } from "@/lib/follow-up/types";
import type { DispatchResult } from "@/lib/ghl/dispatch";
import type { GhlDb } from "@/lib/ghl/tokens";
import type { Json } from "@/types/database";

export async function finalizeFollowUpDispatch(
  db: GhlDb,
  args: {
    dispatchId: string;
    result: DispatchResult;
    body: string | null;
    subject: string | null;
  }
): Promise<void> {
  const { data: draft } = await db
    .from("follow_up_drafts")
    .select("*")
    .eq("dispatch_id", args.dispatchId)
    .maybeSingle();
  if (!draft) {
    if (args.result.status !== "queued") {
      followUpWarn("follow_up.dispatch_unlinked", {
        dispatchId: args.dispatchId,
        result: args.result.status,
      });
    }
    return;
  }

  if (args.result.status === "queued") {
    followUpLog("follow_up.dispatch_queued", { draftId: draft.id, dispatchId: args.dispatchId });
    return;
  }

  if (draft.status === "discarded" || draft.status === "rejected") {
    followUpWarn("follow_up.dispatch_after_halt", {
      draftId: draft.id,
      draftStatus: draft.status,
      result: args.result.status,
    });
    return;
  }

  if (args.result.status === "suppressed") {
    await db
      .from("follow_up_drafts")
      .update({
        status: "discarded",
        discarded_reason: args.result.reason,
        failure_reason: args.result.reason,
      })
      .eq("id", draft.id);
    await db.from("follow_up_events").insert({
      org_id: draft.org_id,
      lead_id: draft.lead_id,
      draft_id: draft.id,
      sequence_run_id: draft.sequence_run_id,
      kind: "discarded",
      actor_member_id: draft.approved_by_member_id,
      payload: { reason: args.result.reason } as Json,
    });
    await db.rpc("halt_follow_up_sequences_for_lead", {
      p_org_id: draft.org_id,
      p_lead_id: draft.lead_id,
      p_reason: "suppressed",
      p_actor: draft.approved_by_member_id,
    });
    followUpWarn("follow_up.suppressed", { draftId: draft.id, reason: args.result.reason });
    return;
  }

  if (args.result.status === "failed" || args.result.status === "halted") {
    const reason = args.result.status === "halted" ? args.result.reason : args.result.reason;
    await db
      .from("follow_up_drafts")
      .update({
        status: "failed",
        failure_reason: reason,
      })
      .eq("id", draft.id);
    await db.from("follow_up_events").insert({
      org_id: draft.org_id,
      lead_id: draft.lead_id,
      draft_id: draft.id,
      sequence_run_id: draft.sequence_run_id,
      kind: "failed",
      actor_member_id: draft.approved_by_member_id,
      payload: { reason } as Json,
    });
    followUpWarn("follow_up.send_failed", { draftId: draft.id, reason });
    return;
  }

  const sentAt = new Date().toISOString();
  const { data: call } = await db
    .from("calls")
    .select("occurred_at, scheduled_at")
    .eq("id", draft.call_id)
    .maybeSingle();
  const callEnd = call?.occurred_at ?? call?.scheduled_at;
  const callEndToSentMs = callEnd ? Math.max(0, Date.parse(sentAt) - Date.parse(callEnd)) : null;

  await db
    .from("follow_up_drafts")
    .update({
      status: "sent",
      sent_at: sentAt,
      sent_body: args.body ?? draft.edited_body,
      sent_subject: args.subject ?? draft.edited_subject,
      touch_id: args.result.touchId || draft.touch_id,
      call_end_to_sent_ms: callEndToSentMs,
    })
    .eq("id", draft.id);

  if (args.result.touchId && args.body) {
    await db
      .from("touches")
      .update({ outbound_body: args.body })
      .eq("id", args.result.touchId)
      .eq("org_id", draft.org_id)
      .eq("direction", "outbound");
  }

  await db.from("follow_up_events").insert({
    org_id: draft.org_id,
    lead_id: draft.lead_id,
    draft_id: draft.id,
    sequence_run_id: draft.sequence_run_id,
    kind: "sent",
    actor_member_id: draft.approved_by_member_id,
    payload: {
      touchId: args.result.touchId,
      editDistance: draft.edit_distance,
      callEndToSentMs,
    } as Json,
  });

  if (draft.sequence_run_id) {
    await db
      .from("follow_up_sequence_runs")
      .update({
        last_sent_at: sentAt,
        last_sent_draft_id: draft.id,
        next_position: draft.sequence_position + 1,
      })
      .eq("id", draft.sequence_run_id)
      .eq("status", "active");
    await maybeEnqueueNextStep(db, {
      orgId: draft.org_id,
      leadId: draft.lead_id,
      callId: draft.call_id,
      extractionId: draft.extraction_id,
      sequenceRunId: draft.sequence_run_id,
      positionJustSent: draft.sequence_position,
      branch: draft.branch,
      callAt: callEnd ?? null,
    });
  }
}

async function maybeEnqueueNextStep(
  db: GhlDb,
  args: {
    orgId: string;
    leadId: string;
    callId: string;
    extractionId: string | null;
    sequenceRunId: string;
    positionJustSent: number;
    branch: FollowUpBranch;
    callAt: string | null;
  }
) {
  const { data: settings } = await db
    .from("follow_up_settings")
    .select("sequences_halted, max_sequence_length")
    .eq("org_id", args.orgId)
    .maybeSingle();
  if (settings?.sequences_halted) return;

  const { data: run } = await db
    .from("follow_up_sequence_runs")
    .select("status, max_steps, max_until, branch")
    .eq("id", args.sequenceRunId)
    .maybeSingle();
  if (!run || run.status !== "active") return;

  const nextPosition = args.positionJustSent + 1;
  if (nextPosition > run.max_steps || nextPosition > (settings?.max_sequence_length ?? 3)) {
    await db
      .from("follow_up_sequence_runs")
      .update({
        status: nextPosition > run.max_steps ? "completed" : "halted",
        halt_reason: nextPosition > run.max_steps ? null : "max_length",
        halted_at: nextPosition > run.max_steps ? null : new Date().toISOString(),
        completed_at: nextPosition > run.max_steps ? new Date().toISOString() : null,
      })
      .eq("id", args.sequenceRunId)
      .eq("status", "active");
    return;
  }
  if (new Date(run.max_until).getTime() <= Date.now()) {
    await db
      .from("follow_up_sequence_runs")
      .update({
        status: "halted",
        halt_reason: "max_duration",
        halted_at: new Date().toISOString(),
      })
      .eq("id", args.sequenceRunId)
      .eq("status", "active");
    return;
  }

  const { data: rules } = await db
    .from("follow_up_routing_rules")
    .select("branch, channel, sequence_steps, enabled, priority, match")
    .eq("org_id", args.orgId)
    .eq("branch", run.branch)
    .eq("enabled", true)
    .order("priority", { ascending: true })
    .limit(1);
  const parsed = (rules ?? [])
    .map((row) =>
      parseRoutingRule({
        priority: row.priority,
        branch: row.branch,
        enabled: row.enabled,
        match: row.match,
        channel: row.channel,
        sequence_steps: row.sequence_steps,
      })
    )
    .find(Boolean);
  const steps = boundedSequenceSteps(parsed?.sequenceSteps ?? [], settings?.max_sequence_length ?? 3);
  const next = steps[nextPosition - 1];
  if (!next) {
    await db
      .from("follow_up_sequence_runs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", args.sequenceRunId)
      .eq("status", "active");
    return;
  }

  const channel: FollowUpChannel = next.channel ?? parsed?.channel ?? "sms";
  await enqueueSequenceStep(db, {
    orgId: args.orgId,
    leadId: args.leadId,
    callId: args.callId,
    extractionId: args.extractionId,
    sequenceRunId: args.sequenceRunId,
    position: nextPosition,
    branch: run.branch,
    channel,
    delayHours: next.delayHours,
    callAt: args.callAt,
  });
}
