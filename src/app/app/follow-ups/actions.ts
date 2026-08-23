"use server";

import { revalidatePath } from "next/cache";

import { isLeadId } from "@/lib/cases/filters";
import { getAuthContext } from "@/lib/auth/session";
import { canApproveFollowUp } from "@/lib/auth/permissions";
import { MAX_VOICE_EXAMPLES } from "@/lib/follow-up/constants";
import { runFollowUpJob } from "@/lib/follow-up/generate";
import { loadFollowUpReview } from "@/lib/follow-up/load";
import { computeSendAt } from "@/lib/follow-up/quiet-hours";
import { editDistanceFor } from "@/lib/follow-up/suggestions";
import type { FollowUpReviewPayload } from "@/lib/follow-up/types";
import { examplesToJson, parseVoiceExamples } from "@/lib/follow-up/voice";
import { dispatchOutboundMessage } from "@/lib/ghl/dispatch";
import { revalidateLeadSurfaces } from "@/lib/leads/revalidate";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type { AuthContext } from "@/lib/auth/types";

export type FollowUpActionResult =
  | { ok: true }
  | { ok: false; error: string };

function fail(error: string): FollowUpActionResult {
  return { ok: false, error };
}

function denyUnlessAssignee(
  ctx: AuthContext,
  lead: { assigned_setter_id: string | null; assigned_closer_id: string | null }
): { ok: false; error: string } | null {
  if (
    canApproveFollowUp({
      role: ctx.role,
      memberId: ctx.member.id,
      assignedSetterId: lead.assigned_setter_id,
      assignedCloserId: lead.assigned_closer_id,
      isPlatformAdmin: ctx.isPlatformAdmin,
    })
  ) {
    return null;
  }
  return { ok: false, error: "You can only work drafts for leads assigned to you." };
}

function revalidateFollowUp(leadId: string, draftId?: string) {
  revalidateLeadSurfaces(leadId);
  if (draftId) revalidatePath(`/app/follow-ups/${draftId}`);
  revalidatePath("/app/settings/follow-up");
}

async function requireDraft(draftId: string) {
  if (!isLeadId(draftId)) return { ok: false as const, error: "That draft is not in this workspace." };
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("follow_up_drafts")
    .select("*")
    .eq("id", draftId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (error || !data) return { ok: false as const, error: "That draft is not in this workspace." };
  return { ok: true as const, ctx, draft: data };
}

async function requireAssignedDraft(draftId: string) {
  const scoped = await requireDraft(draftId);
  if (!scoped.ok) return scoped;
  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("assigned_setter_id, assigned_closer_id")
    .eq("id", scoped.draft.lead_id)
    .eq("org_id", scoped.ctx.org.id)
    .maybeSingle();
  if (!lead) return { ok: false as const, error: "That lead is not in this workspace." };
  const denied = denyUnlessAssignee(scoped.ctx, lead);
  if (denied) return { ok: false as const, error: denied.error };
  return scoped;
}

export async function refreshFollowUpReview(draftId: string): Promise<FollowUpReviewPayload | null> {
  if (!isLeadId(draftId)) return null;
  return loadFollowUpReview(draftId);
}

export async function saveFollowUpEdit(input: {
  draftId: string;
  body: string;
  subject: string;
}): Promise<FollowUpActionResult> {
  const scoped = await requireAssignedDraft(input.draftId);
  if (!scoped.ok) return scoped;
  if (scoped.draft.status !== "pending" && scoped.draft.status !== "failed" && scoped.draft.status !== "expired") {
    return fail("This draft can no longer be edited.");
  }
  const body = input.body.trim();
  if (!body) return fail("The message cannot be empty.");
  const subject = scoped.draft.channel === "email" ? input.subject.trim() : "";
  if (scoped.draft.channel === "email" && !subject) return fail("Email needs a subject.");

  const distance = editDistanceFor(scoped.draft.generated_body, body);
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("follow_up_drafts")
    .update({
      edited_body: body,
      edited_subject: scoped.draft.channel === "email" ? subject : null,
      edit_distance: distance,
    })
    .eq("id", scoped.draft.id)
    .eq("org_id", scoped.ctx.org.id);
  if (error) return fail("Could not save those edits.");

  await admin.from("follow_up_events").insert({
    org_id: scoped.ctx.org.id,
    draft_id: scoped.draft.id,
    sequence_run_id: scoped.draft.sequence_run_id,
    kind: "edited",
    actor_member_id: scoped.ctx.member.id,
    payload: { editDistance: distance } as Json,
  });
  revalidateFollowUp(scoped.draft.lead_id, scoped.draft.id);
  return { ok: true };
}

export async function regenerateFollowUp(input: {
  draftId: string;
  instruction: string;
}): Promise<FollowUpActionResult> {
  const scoped = await requireAssignedDraft(input.draftId);
  if (!scoped.ok) return scoped;
  if (!["pending", "failed", "expired", "rejected"].includes(scoped.draft.status)) {
    return fail("This draft cannot be regenerated.");
  }
  const admin = getSupabaseAdmin();
  const { data: job, error } = await admin
    .from("follow_up_jobs")
    .insert({
      org_id: scoped.ctx.org.id,
      lead_id: scoped.draft.lead_id,
      call_id: scoped.draft.call_id,
      extraction_id: scoped.draft.extraction_id,
      sequence_run_id: scoped.draft.sequence_run_id,
      sequence_position: scoped.draft.sequence_position,
      branch: scoped.draft.branch,
      channel: scoped.draft.channel,
      status: "pending",
      operator_instruction: input.instruction.trim() || null,
      requested_by_member_id: scoped.ctx.member.id,
      draft_id: scoped.draft.id,
    })
    .select("id")
    .maybeSingle();
  if (error || !job) return fail("Could not start regeneration.");
  try {
    await runFollowUpJob(admin, job.id);
  } catch {
    return fail("Regeneration failed. The previous draft is still here.");
  }
  revalidateFollowUp(scoped.draft.lead_id, scoped.draft.id);
  return { ok: true };
}

export async function rejectFollowUp(input: {
  draftId: string;
  reason: string;
}): Promise<FollowUpActionResult> {
  const scoped = await requireAssignedDraft(input.draftId);
  if (!scoped.ok) return scoped;
  const reason = input.reason.trim();
  if (!reason) return fail("Say why you are rejecting it. That is the feedback signal.");
  if (reason.length > 500) return fail("Keep the reason under 500 characters.");
  if (!["pending", "failed", "expired"].includes(scoped.draft.status)) {
    return fail("This draft cannot be rejected.");
  }
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("follow_up_drafts")
    .update({
      status: "rejected",
      rejected_at: new Date().toISOString(),
      rejected_by_member_id: scoped.ctx.member.id,
      rejected_reason: reason,
    })
    .eq("id", scoped.draft.id)
    .eq("org_id", scoped.ctx.org.id);
  if (error) return fail("Could not reject that draft.");
  await admin.from("follow_up_events").insert({
    org_id: scoped.ctx.org.id,
    draft_id: scoped.draft.id,
    sequence_run_id: scoped.draft.sequence_run_id,
    kind: "rejected",
    actor_member_id: scoped.ctx.member.id,
    payload: { reason } as Json,
  });
  revalidateFollowUp(scoped.draft.lead_id, scoped.draft.id);
  return { ok: true };
}

export async function approveFollowUp(input: {
  draftId: string;
  body: string;
  subject: string;
  confirmChannel: string;
  confirmRecipient: string;
  confirmSendAt: string;
  confirmLowConfidence?: boolean;
}): Promise<FollowUpActionResult> {
  const scoped = await requireDraft(input.draftId);
  if (!scoped.ok) return scoped;
  const stale =
    scoped.draft.status === "expired" || Date.parse(scoped.draft.expires_at) <= Date.now();
  if (stale) {
    return fail("This draft is stale. Regenerate it before sending.");
  }
  if (scoped.draft.status !== "pending" && scoped.draft.status !== "failed") {
    return fail("This draft is not waiting for approval.");
  }
  if (scoped.draft.low_confidence && input.confirmLowConfidence !== true) {
    return fail("This draft failed the quality check. Confirm that you still want to send it.");
  }

  const body = input.body.trim();
  if (!body) return fail("The message cannot be empty.");
  const channel = scoped.draft.channel === "email" ? "email" : "sms";
  if (input.confirmChannel !== channel) {
    return fail("Channel confirmation does not match this draft.");
  }
  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("email, phone, timezone, assigned_setter_id, assigned_closer_id")
    .eq("id", scoped.draft.lead_id)
    .eq("org_id", scoped.ctx.org.id)
    .maybeSingle();
  if (!lead) return fail("That lead is not in this workspace.");
  const denied = denyUnlessAssignee(scoped.ctx, lead);
  if (denied) return denied;
  const recipient = channel === "email" ? lead.email : lead.phone;
  if (!recipient) {
    return fail(channel === "email" ? "This lead has no email." : "This lead has no phone number.");
  }
  if (input.confirmRecipient.trim() !== recipient) {
    return fail("Recipient confirmation does not match the lead.");
  }

  const { data: settings } = await supabase
    .from("follow_up_settings")
    .select("quiet_hours_enabled, quiet_hours_start, quiet_hours_end")
    .eq("org_id", scoped.ctx.org.id)
    .maybeSingle();
  const timeZone = lead.timezone || scoped.ctx.org.timezone;
  const sendAt = computeSendAt({
    now: new Date(),
    timeZone,
    enabled: settings?.quiet_hours_enabled ?? true,
    startHm: (settings?.quiet_hours_start ?? "21:00").slice(0, 5),
    endHm: (settings?.quiet_hours_end ?? "08:00").slice(0, 5),
  }).toISOString();
  if (input.confirmSendAt && Math.abs(Date.parse(input.confirmSendAt) - Date.parse(sendAt)) > 120_000) {
    return fail("Send time changed (quiet hours). Confirm again.");
  }

  const subject = channel === "email" ? input.subject.trim() : null;
  if (channel === "email" && !subject) return fail("Email needs a subject.");

  const distance = editDistanceFor(scoped.draft.generated_body, body);
  const admin = getSupabaseAdmin();
  await admin
    .from("follow_up_drafts")
    .update({
      edited_body: body,
      edited_subject: subject,
      edit_distance: distance,
    })
    .eq("id", scoped.draft.id)
    .eq("org_id", scoped.ctx.org.id);

  const result = await dispatchOutboundMessage(admin, {
    orgId: scoped.ctx.org.id,
    leadId: scoped.draft.lead_id,
    channel,
    content: body,
    subject: subject ?? undefined,
    actorMemberId: scoped.ctx.member.id,
    idempotencyKey: `follow-up:${scoped.draft.id}`,
    availableAt: sendAt,
    followUpDraftId: scoped.draft.id,
  });

  if (result.status === "halted") {
    return fail(
      result.reason === "connection_missing"
        ? "The CRM is not connected, so nothing was sent."
        : "The CRM connection is broken, so nothing was sent."
    );
  }
  if (result.status === "suppressed") {
    revalidateFollowUp(scoped.draft.lead_id, scoped.draft.id);
    return fail(`The CRM reports this contact as opted out (${result.reason}). The draft was discarded. There is no override.`);
  }
  if (result.status === "failed") {
    revalidateFollowUp(scoped.draft.lead_id, scoped.draft.id);
    return fail(`Send failed (${result.reason}). No touch was recorded.`);
  }

  const { error: approvedError } = await admin.from("follow_up_events").insert({
    org_id: scoped.ctx.org.id,
    draft_id: scoped.draft.id,
    sequence_run_id: scoped.draft.sequence_run_id,
    kind: "approved",
    actor_member_id: scoped.ctx.member.id,
    payload: { channel, recipient, sendAt, editDistance: distance } as Json,
  });
  if (approvedError) {
    revalidateFollowUp(scoped.draft.lead_id, scoped.draft.id);
    return fail("The send went through, but the approval event did not record. Check the draft.");
  }

  revalidateFollowUp(scoped.draft.lead_id, scoped.draft.id);
  return { ok: true };
}

export async function retryFollowUpSend(draftId: string): Promise<FollowUpActionResult> {
  const scoped = await requireDraft(draftId);
  if (!scoped.ok) return scoped;
  if (scoped.draft.status !== "failed") return fail("Only a failed send can be retried.");
  if (!scoped.draft.approved_by_member_id) return fail("This draft was never approved.");
  if (Date.parse(scoped.draft.expires_at) <= Date.now()) {
    return fail("This draft is stale. Regenerate it before sending.");
  }
  const channel = scoped.draft.channel === "email" ? "email" : "sms";
  const supabase = await createClient();
  const [{ data: lead }, { data: settings }] = await Promise.all([
    supabase
      .from("leads")
      .select("timezone, assigned_setter_id, assigned_closer_id")
      .eq("id", scoped.draft.lead_id)
      .eq("org_id", scoped.ctx.org.id)
      .maybeSingle(),
    supabase
      .from("follow_up_settings")
      .select("quiet_hours_enabled, quiet_hours_start, quiet_hours_end")
      .eq("org_id", scoped.ctx.org.id)
      .maybeSingle(),
  ]);
  if (!lead) return fail("That lead is not in this workspace.");
  const denied = denyUnlessAssignee(scoped.ctx, lead);
  if (denied) return denied;
  const sendAt = computeSendAt({
    now: new Date(),
    timeZone: lead.timezone || scoped.ctx.org.timezone,
    enabled: settings?.quiet_hours_enabled ?? true,
    startHm: (settings?.quiet_hours_start ?? "21:00").slice(0, 5),
    endHm: (settings?.quiet_hours_end ?? "08:00").slice(0, 5),
  }).toISOString();
  const admin = getSupabaseAdmin();
  const result = await dispatchOutboundMessage(admin, {
    orgId: scoped.ctx.org.id,
    leadId: scoped.draft.lead_id,
    channel,
    content: scoped.draft.edited_body,
    subject: scoped.draft.edited_subject ?? undefined,
    actorMemberId: scoped.draft.approved_by_member_id,
    idempotencyKey: `follow-up:${scoped.draft.id}`,
    availableAt: sendAt,
    followUpDraftId: scoped.draft.id,
  });
  if (result.status === "failed" || result.status === "halted" || result.status === "suppressed") {
    revalidateFollowUp(scoped.draft.lead_id, scoped.draft.id);
    return fail(
      result.status === "suppressed"
        ? "The CRM reports this contact as opted out. The draft was discarded."
        : "Retry failed. No touch was recorded."
    );
  }
  revalidateFollowUp(scoped.draft.lead_id, scoped.draft.id);
  return { ok: true };
}

export async function haltLeadSequence(input: {
  sequenceRunId: string;
  leadId: string;
}): Promise<FollowUpActionResult> {
  if (!isLeadId(input.sequenceRunId) || !isLeadId(input.leadId)) {
    return fail("That sequence is not in this workspace.");
  }
  const ctx = await getAuthContext();
  const admin = getSupabaseAdmin();
  const { data: run } = await admin
    .from("follow_up_sequence_runs")
    .select("id, lead_id")
    .eq("id", input.sequenceRunId)
    .eq("org_id", ctx.org.id)
    .eq("lead_id", input.leadId)
    .maybeSingle();
  if (!run) return fail("That sequence is not in this workspace.");
  const { error } = await admin.rpc("halt_follow_up_sequences_for_lead", {
    p_org_id: ctx.org.id,
    p_lead_id: input.leadId,
    p_reason: "operator",
    p_actor: ctx.member.id,
  });
  if (error) return fail("Could not halt that sequence.");
  revalidateLeadSurfaces(input.leadId);
  return { ok: true };
}

export async function promoteSentToVoiceExample(draftId: string): Promise<FollowUpActionResult> {
  const scoped = await requireDraft(draftId);
  if (!scoped.ok) return scoped;
  if (scoped.draft.status !== "sent" || !scoped.draft.sent_body) {
    return fail("Only a sent message can be promoted.");
  }
  const admin = getSupabaseAdmin();
  const { data: profile } = await admin
    .from("org_voice_profiles")
    .select("examples")
    .eq("org_id", scoped.ctx.org.id)
    .maybeSingle();
  const examples = parseVoiceExamples(profile?.examples);
  if (examples.some((item) => item.sourceDraftId === scoped.draft.id)) {
    return fail("That message is already in the voice examples.");
  }
  if (examples.length >= MAX_VOICE_EXAMPLES) {
    return fail("Voice examples are capped at five. Remove one first.");
  }
  const channel = scoped.draft.channel === "email" ? "email" : "sms";
  const next = examplesToJson([
    ...examples,
    {
      body: scoped.draft.sent_body,
      channel,
      addedAt: new Date().toISOString(),
      sourceDraftId: scoped.draft.id,
    },
  ]);
  const { error } = await admin
    .from("org_voice_profiles")
    .update({ examples: next as Json })
    .eq("org_id", scoped.ctx.org.id);
  if (error) return fail("Could not add that example.");
  revalidateFollowUp(scoped.draft.lead_id, scoped.draft.id);
  return { ok: true };
}
