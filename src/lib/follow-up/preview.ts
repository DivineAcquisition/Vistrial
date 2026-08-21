import "server-only";

import { createAnthropicMessage, anthropicDraftModel } from "@/lib/extraction/anthropic";
import { DRAFT_SYSTEM_PROMPT, draftUserPrompt } from "@/lib/follow-up/prompt";
import { checkDraftQuality } from "@/lib/follow-up/quality";
import { parseDraftModelOutput } from "@/lib/follow-up/parse";
import type { QualityResult, VoiceProfile } from "@/lib/follow-up/types";
import { parseVoiceProfile } from "@/lib/follow-up/voice";
import type { GhlDb } from "@/lib/ghl/tokens";

export type DraftPreviewResult = {
  body: string;
  subject: string | null;
  quality: QualityResult;
  usedExamples: number;
};

const PREVIEW_TRANSCRIPT =
  'Closer: What is the timeline looking like?\nMaya: We want to start this quarter.\nCloser: Next step?\nMaya: Send me the Tuesday callback.';

export async function generateVoiceSampleDraft(
  db: GhlDb,
  args: {
    orgId: string;
    lead: {
      firstName: string | null;
      source: string | null;
      offerName: string | null;
    };
    transcript?: string;
  }
): Promise<DraftPreviewResult> {
  const { data } = await db.from("org_voice_profiles").select("*").eq("org_id", args.orgId).maybeSingle();
  const voice: VoiceProfile = data
    ? parseVoiceProfile(data)
    : parseVoiceProfile({
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

  const transcript = args.transcript ?? PREVIEW_TRANSCRIPT;
  const quote = "We want to start this quarter";
  const message = await createAnthropicMessage({
    system: DRAFT_SYSTEM_PROMPT,
    user: draftUserPrompt({
      branch: "follow_up_scheduled",
      channel: "sms",
      voice,
      noShowCount: 0,
      sequencePosition: 1,
      lead: args.lead,
      extraction: {
        summary: "Held a triage call. They asked for a Tuesday callback.",
        statedObjection: null,
        statedObjectionState: "absent",
        budgetSignal: null,
        budgetState: "absent",
        timelineSignal: quote,
        timelineState: "present",
        decisionProcess: null,
        decisionState: "absent",
        nextStep: "Tuesday callback",
        nextStepState: "present",
        quotes: [{ text: quote, topic: "timeline" }],
      },
      priorOpenObjections: [],
      readiness: { total: null, reasoning: null },
      priorTouches: [],
    }),
    model: anthropicDraftModel(),
    maxTokens: 800,
    timeoutMs: 90_000,
  });

  const parsed = parseDraftModelOutput(message.text, "sms");
  const quality = checkDraftQuality({
    body: parsed.body,
    subject: parsed.subject,
    channel: "sms",
    transcript,
    quotes: [quote],
    statedObjection: null,
    nextStep: "Tuesday callback",
    nextStepState: "present",
    budgetState: "absent",
    timelineState: "present",
    decisionState: "absent",
    voice,
  });

  return {
    body: parsed.body,
    subject: parsed.subject,
    quality,
    usedExamples: voice.examples.length,
  };
}
