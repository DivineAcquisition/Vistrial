import "server-only";

import { canApproveFollowUp } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { computeSendAt } from "@/lib/follow-up/quiet-hours";
import { parseRoutingRule } from "@/lib/follow-up/routing";
import type {
  FollowUpChannel,
  FollowUpReviewPayload,
  FollowUpSettings,
  RoutingRule,
  VoiceProfile,
} from "@/lib/follow-up/types";
import { parseVoiceProfile } from "@/lib/follow-up/voice";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

function asQuotes(value: Json): Array<{ text: string; topic: string }> {
  if (!Array.isArray(value)) return [];
  const quotes: Array<{ text: string; topic: string }> = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const text = typeof item.text === "string" ? item.text.trim() : "";
    const topic = typeof item.topic === "string" ? item.topic : "situation";
    if (text) quotes.push({ text, topic });
  }
  return quotes;
}

function leadName(row: { first_name: string | null; last_name: string | null; email: string | null }) {
  return [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.email || "Unnamed lead";
}

export async function loadFollowUpSettings(orgId: string): Promise<FollowUpSettings> {
  const supabase = await createClient();
  const { data } = await supabase.from("follow_up_settings").select("*").eq("org_id", orgId).maybeSingle();
  return {
    sequencesHalted: data?.sequences_halted ?? false,
    maxSequenceLength: data?.max_sequence_length ?? 3,
    maxSequenceDurationDays: data?.max_sequence_duration_days ?? 21,
    draftStaleDays: data?.draft_stale_days ?? 5,
    quietHoursEnabled: data?.quiet_hours_enabled ?? true,
    quietHoursStart: (data?.quiet_hours_start ?? "21:00").slice(0, 5),
    quietHoursEnd: (data?.quiet_hours_end ?? "08:00").slice(0, 5),
    defaultChannel: data?.default_channel === "email" ? "email" : "sms",
  };
}

export async function loadVoiceProfile(orgId: string): Promise<VoiceProfile> {
  const supabase = await createClient();
  const { data } = await supabase.from("org_voice_profiles").select("*").eq("org_id", orgId).maybeSingle();
  if (!data) {
    return parseVoiceProfile({
      formality: "casual",
      use_contractions: true,
      use_greeting: false,
      use_signoff: false,
      greeting_text: null,
      signoff_text: null,
      sms_max_chars: 240,
      email_max_chars: 900,
      emoji_usage: "never",
      banned_words: [],
      examples: [],
    });
  }
  return parseVoiceProfile(data);
}

export async function loadRoutingRules(orgId: string): Promise<RoutingRule[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("follow_up_routing_rules")
    .select("id, priority, branch, enabled, match, channel, sequence_steps")
    .eq("org_id", orgId)
    .order("priority", { ascending: true });
  return (data ?? [])
    .map((row) =>
      parseRoutingRule({
        id: row.id,
        priority: row.priority,
        branch: row.branch,
        enabled: row.enabled,
        match: row.match,
        channel: row.channel,
        sequence_steps: row.sequence_steps,
      })
    )
    .filter((item): item is RoutingRule => item !== null);
}

export async function loadFollowUpReview(draftId: string): Promise<FollowUpReviewPayload | null> {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { data: draft } = await supabase
    .from("follow_up_drafts")
    .select("*")
    .eq("id", draftId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!draft) return null;

  const [{ data: lead }, { data: call }, { data: extraction }, settings] = await Promise.all([
    supabase
      .from("leads")
      .select("id, first_name, last_name, email, phone, source, offer_name, timezone, assigned_setter_id, assigned_closer_id")
      .eq("id", draft.lead_id)
      .eq("org_id", ctx.org.id)
      .maybeSingle(),
    supabase
      .from("calls")
      .select("id, outcome, occurred_at, scheduled_at")
      .eq("id", draft.call_id)
      .eq("org_id", ctx.org.id)
      .maybeSingle(),
    supabase
      .from("call_extractions")
      .select("summary, stated_objection, quotes, next_step_agreed, next_step_state, budget_signal_state")
      .eq("call_id", draft.call_id)
      .maybeSingle(),
    loadFollowUpSettings(ctx.org.id),
  ]);
  if (!lead || !call) return null;

  const timeZone = lead.timezone || ctx.org.timezone;
  const proposedSendAt = computeSendAt({
    now: new Date(),
    timeZone,
    enabled: settings.quietHoursEnabled,
    startHm: settings.quietHoursStart,
    endHm: settings.quietHoursEnd,
  }).toISOString();

  const quotesUsed = Array.isArray(draft.quotes_used)
    ? draft.quotes_used.filter((item): item is string => typeof item === "string")
    : [];

  return {
    draft: {
      id: draft.id,
      orgId: draft.org_id,
      leadId: draft.lead_id,
      callId: draft.call_id,
      extractionId: draft.extraction_id,
      branch: draft.branch,
      channel: (draft.channel === "email" ? "email" : "sms") as FollowUpChannel,
      status: draft.status,
      generatedBody: draft.generated_body,
      generatedSubject: draft.generated_subject,
      editedBody: draft.edited_body,
      editedSubject: draft.edited_subject,
      sentBody: draft.sent_body,
      modelVersion: draft.model_version,
      lowConfidence: draft.low_confidence,
      lowConfidenceReason: draft.low_confidence_reason,
      expiresAt: draft.expires_at,
      stale:
        draft.status === "expired" ||
        (Date.parse(draft.expires_at) <= Date.now() && draft.status !== "sent"),
      sequencePosition: draft.sequence_position,
      sequenceRunId: draft.sequence_run_id,
      approvedAt: draft.approved_at,
      failureReason: draft.failure_reason,
      quotesUsed,
      verificationStatus:
        draft.verification_status === "passed" || draft.verification_status === "needs_review"
          ? draft.verification_status
          : "unchecked",
      verificationFaults: Array.isArray(draft.verification_faults)
        ? (draft.verification_faults as Array<{ code?: unknown; where?: unknown; what?: unknown }>)
            .map((item) => ({
              code: typeof item.code === "string" ? item.code : "",
              where: typeof item.where === "string" ? item.where : "output",
              what: typeof item.what === "string" ? item.what : "",
            }))
            .filter((item) => item.code && item.what)
        : [],
    },
    lead: {
      id: lead.id,
      name: leadName(lead),
      firstName: lead.first_name,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      offerName: lead.offer_name,
      timezone: lead.timezone,
    },
    call: {
      id: call.id,
      outcome: call.outcome,
      occurredAt: call.occurred_at,
      scheduledAt: call.scheduled_at,
    },
    extraction: {
      summary: extraction?.summary ?? null,
      statedObjection: extraction?.stated_objection ?? null,
      quotes: extraction ? asQuotes(extraction.quotes) : [],
      nextStepAgreed: extraction?.next_step_agreed ?? null,
      nextStepState: extraction?.next_step_state ?? "absent",
      budgetSignalState: extraction?.budget_signal_state ?? "absent",
    },
    settings,
    orgTimezone: ctx.org.timezone,
    proposedSendAt,
    canApprove: canApproveFollowUp({
      role: ctx.role,
      memberId: ctx.member.id,
      assignedSetterId: lead.assigned_setter_id,
      assignedCloserId: lead.assigned_closer_id,
      isPlatformAdmin: ctx.isPlatformAdmin,
    }),
  };
}

