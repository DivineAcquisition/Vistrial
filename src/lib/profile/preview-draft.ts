import "server-only";

import { createAnthropicMessage, anthropicApiKey, anthropicDraftModel } from "@/lib/extraction/anthropic";
import { DRAFT_SYSTEM_PROMPT, draftUserPrompt } from "@/lib/follow-up/prompt";
import { parseDraftModelOutput } from "@/lib/follow-up/parse";
import { parseVoiceProfile } from "@/lib/follow-up/voice";
import type { FollowUpChannel, VoiceProfile } from "@/lib/follow-up/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type VoicePreview =
  | {
      kind: "draft";
      leadName: string;
      channel: FollowUpChannel;
      subject: string | null;
      body: string;
      basis: string;
    }
  | {
      kind: "no_call";
      leadName: string | null;
      exampleCount: number;
      basis: string;
    }
  | { kind: "unavailable"; reason: string };

function leadName(row: {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}): string {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return name || row.email || "this lead";
}

/**
 * The voice stage has to end with a real draft for a real lead. That is only
 * possible once a call has been extracted, because a follow-up draft is
 * grounded in what was actually said. Before then we show the client exactly
 * what the model will be handed instead of inventing a message.
 *
 * Nothing here is persisted. It is a preview, not a queue item.
 */
export async function previewVoiceDraft(orgId: string): Promise<VoicePreview> {
  const admin = getSupabaseAdmin();

  const { data: voiceRow } = await admin
    .from("org_voice_profiles")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  const voice: VoiceProfile | null = voiceRow ? parseVoiceProfile(voiceRow) : null;

  const { data: extraction } = await admin
    .from("call_extractions")
    .select(
      "call_id, summary, stated_objection, stated_objection_state, budget_signal, budget_signal_state, timeline_signal, timeline_signal_state, decision_process, decision_process_state, next_step_agreed, next_step_state, quotes"
    )
    .eq("org_id", orgId)
    .order("extracted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: fallbackLead } = await admin
    .from("leads")
    .select("id, first_name, last_name, email")
    .eq("org_id", orgId)
    .order("opted_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!extraction) {
    return {
      kind: "no_call",
      leadName: fallbackLead ? leadName(fallbackLead) : null,
      exampleCount: voice?.examples.length ?? 0,
      basis:
        "A follow-up draft is grounded in what was said on a call, and no call has been extracted for this workspace yet. The first draft will be written on the first call that lands.",
    };
  }

  if (!anthropicApiKey()) {
    return {
      kind: "unavailable",
      reason:
        "Draft generation needs the model key, which is not configured on this deployment. Everything you entered is saved and will be used the moment it is.",
    };
  }

  const { data: call } = await admin
    .from("calls")
    .select("id, lead_id")
    .eq("id", extraction.call_id)
    .maybeSingle();

  const { data: lead } = call
    ? await admin
        .from("leads")
        .select("id, first_name, last_name, email, source, offer_name, current_score")
        .eq("id", call.lead_id)
        .maybeSingle()
    : { data: null };

  if (!lead || !voice) {
    return {
      kind: "no_call",
      leadName: fallbackLead ? leadName(fallbackLead) : null,
      exampleCount: voice?.examples.length ?? 0,
      basis: "The extracted call could not be matched back to a lead, so there is nothing to draft against.",
    };
  }

  const channel: FollowUpChannel =
    voice.examples[0]?.channel ?? (voice.emailMaxChars > 0 ? "sms" : "sms");

  const quotes = Array.isArray(extraction.quotes)
    ? (extraction.quotes as Array<{ text?: string; topic?: string }>)
        .filter((item) => typeof item?.text === "string")
        .map((item) => ({ text: String(item.text), topic: String(item.topic ?? "") }))
    : [];

  const user = draftUserPrompt({
    branch: "ghost_risk",
    channel,
    voice,
    noShowCount: 0,
    sequencePosition: 1,
    lead: {
      firstName: lead.first_name,
      source: lead.source,
      offerName: lead.offer_name,
    },
    extraction: {
      summary: extraction.summary,
      statedObjection: extraction.stated_objection,
      statedObjectionState: extraction.stated_objection_state ?? "absent",
      budgetSignal: extraction.budget_signal,
      budgetState: extraction.budget_signal_state ?? "absent",
      timelineSignal: extraction.timeline_signal,
      timelineState: extraction.timeline_signal_state ?? "absent",
      decisionProcess: extraction.decision_process,
      decisionState: extraction.decision_process_state ?? "absent",
      nextStep: extraction.next_step_agreed,
      nextStepState: extraction.next_step_state ?? "absent",
      quotes,
    },
    priorOpenObjections: [],
    readiness: { total: lead.current_score, reasoning: null },
    priorTouches: [],
  });

  try {
    const result = await createAnthropicMessage({
      system: DRAFT_SYSTEM_PROMPT,
      user,
      model: anthropicDraftModel(),
      maxTokens: 1024,
      timeoutMs: 60_000,
    });
    const parsed = parseDraftModelOutput(result.text, channel);
    return {
      kind: "draft",
      leadName: leadName(lead),
      channel,
      subject: parsed.subject,
      body: parsed.body,
      basis: `Written from the real call on ${leadName(lead)} using the ${voice.examples.length} messages you gave us. Nothing was sent and nothing was saved.`,
    };
  } catch {
    return {
      kind: "unavailable",
      reason: "The model did not answer in time. Your voice profile is saved either way.",
    };
  }
}
