"use server";

import { revalidatePath } from "next/cache";

import { isLeadId } from "@/lib/cases/filters";
import { getAuthContext } from "@/lib/auth/session";
import { canApproveFollowUp } from "@/lib/auth/permissions";
import { dbCanApprove, dbCanWorkLead, dbIsStaff } from "@/lib/auth/db-checks";
import { MAX_VOICE_EXAMPLES } from "@/lib/follow-up/constants";
import { runFollowUpJob } from "@/lib/follow-up/generate";
import { loadFollowUpReview } from "@/lib/follow-up/load";
import { editDistanceFor } from "@/lib/follow-up/suggestions";
import type { FollowUpReviewPayload } from "@/lib/follow-up/types";
import { examplesToJson, parseVoiceExamples } from "@/lib/follow-up/voice";
import { requireConfig } from "@/lib/config/server";
import { buildFooter } from "@/lib/relay/footer";
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

async function denyUnlessApprover(ctx: AuthContext): Promise<{ ok: false; error: string } | null> {
  const allowed =
    canApproveFollowUp({ role: ctx.role, canApprove: ctx.member.canApprove, isStaff: ctx.isStaff, staffMayApprove: ctx.staffMayApprove }) &&
    (await dbCanApprove(ctx.org.id));
  if (allowed) return null;
  return { ok: false, error: "Approving drafts needs an owner, or a member the owner has allowed to approve." };
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
  const denied = await denyUnlessApprover(scoped.ctx);
  if (denied) return { ok: false as const, error: denied.error };
  if (await waitingOnGate(scoped.draft.id)) {
    return { ok: false as const, error: "This draft is waiting in Needs your approval. Withdraw it there to change it here." };
  }
  return scoped;
}

async function waitingOnGate(draftId: string): Promise<boolean> {
  const admin = getSupabaseAdmin() as unknown as import("@supabase/supabase-js").SupabaseClient;
  const { data } = await admin
    .from("relay_drafts")
    .select("id")
    .eq("follow_up_draft_id", draftId)
    .in("status", ["waiting", "approved"])
    .limit(1)
    .maybeSingle();
  return Boolean(data);
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
    lead_id: scoped.draft.lead_id,
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
    lead_id: scoped.draft.lead_id,
    draft_id: scoped.draft.id,
    sequence_run_id: scoped.draft.sequence_run_id,
    kind: "rejected",
    actor_member_id: scoped.ctx.member.id,
    payload: { reason } as Json,
  });
  revalidateFollowUp(scoped.draft.lead_id, scoped.draft.id);
  return { ok: true };
}

/**
 * The follow-up screen no longer approves or sends. It hands the draft, as
 * edited, to Needs your approval, where it is approved like every other
 * message and the person sends it from the CRM.
 */
export async function sendFollowUpToApproval(input: {
  draftId: string;
  body: string;
  subject: string;
  confirmLowConfidence?: boolean;
}): Promise<FollowUpActionResult> {
  const scoped = await requireDraft(input.draftId);
  if (!scoped.ok) return scoped;
  if (scoped.draft.low_confidence && input.confirmLowConfidence !== true) {
    return fail("This draft failed the quality check. Confirm that you still want to send it for approval.");
  }
  const channel = scoped.draft.channel === "email" ? "email" : "sms";
  const body = input.body.trim();
  if (!body) return fail("The message cannot be empty.");
  const subject = channel === "email" ? input.subject.trim() : "";
  if (channel === "email" && !subject) return fail("Email needs a subject.");

  const admin = getSupabaseAdmin();
  const configured = await requireConfig(admin, scoped.ctx.org.id, "follow_up_drafter");
  if (!configured.ok) return fail("This workspace's configuration needs attention first. The Vistrial team has been told.");
  const values = configured.config.values;
  const footer = buildFooter({
    channel,
    optOutWords: values["compliance.opt_out_words"],
    disclosures: values["compliance.required_disclosures"],
  });

  const distance = editDistanceFor(scoped.draft.generated_body, body);
  const supabase = (await createClient()) as unknown as {
    rpc: (fn: string, args: object) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
  };
  const { error } = await supabase.rpc("follow_up_to_gate", {
    p_draft_id: scoped.draft.id,
    p_body: body,
    p_subject: subject || null,
    p_footer: footer,
  });
  if (error) {
    const known = error.code === "42501" || error.code === "22023" || error.code === "P0002";
    return fail(known ? error.message : "Could not send this for approval. Try again.");
  }
  await admin
    .from("follow_up_drafts")
    .update({ edit_distance: distance })
    .eq("id", scoped.draft.id)
    .eq("org_id", scoped.ctx.org.id);
  revalidateFollowUp(scoped.draft.lead_id, scoped.draft.id);
  revalidatePath("/app/home");
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
  if (!(await dbCanWorkLead(ctx.org.id, input.leadId))) {
    return fail("That sequence is not in this workspace.");
  }
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
  if (!(await dbIsStaff(scoped.ctx.org.id))) {
    return fail("Voice examples are managed by the Vistrial team.");
  }
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
