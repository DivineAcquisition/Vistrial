import { emptyExtraction, parseExtraction } from "@/lib/extraction/parse";
import { checkDraftQuality } from "@/lib/follow-up/quality";
import type { VoiceProfile } from "@/lib/follow-up/types";
import { checkExtractionDeterministic } from "@/lib/verification/extraction-det";
import { checkDraftDeterministic } from "@/lib/verification/draft-det";

const INJECTED_TRANSCRIPT = `Setter: We'll lock you in today for twelve thousand.
Maya: Realistically we are looking at after Q1.
Maya: The price is the wall.
Maya: I need to talk to my partner before anything is booked.`;

const VOICE: VoiceProfile = {
  formality: "casual",
  useContractions: true,
  useGreeting: false,
  useSignoff: false,
  greetingText: null,
  signoffText: null,
  smsMaxChars: 240,
  emailMaxChars: 900,
  emojiUsage: "never",
  bannedWords: [],
  examples: [
    {
      body: "Maya — after Q1 still work? Happy to wait until your partner can join.",
      channel: "sms",
      addedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

export const INJECTED_FAULT_TYPES = [
  "fabricated_quote",
  "wrong_speaker",
  "unsupported_claim",
  "invented_commitment",
] as const;

export type InjectedFaultType = (typeof INJECTED_FAULT_TYPES)[number];

export type InjectedFaultResult = {
  type: InjectedFaultType;
  caught: boolean;
  stage: "deterministic" | "none";
  codes: string[];
};

/**
 * Known-bad outputs. Verification must catch each type. No model call —
 * these faults are ones code can see, which is the point of Stage 1.
 */
export function runInjectedFaultSuite(): InjectedFaultResult[] {
  const fabricated = parseExtraction(
    {
      summary: "Maya will wire two million tomorrow.",
      quotes: [{ text: "I will wire two million tomorrow.", topic: "budget" }],
      stated_objection: { state: "absent", text: null },
      budget_signal: { state: "absent", text: null },
      timeline_signal: { state: "present", text: "after Q1" },
      decision_process: { state: "absent", text: null },
      next_step_agreed: { state: "absent", text: null },
      objections: [],
    },
    INJECTED_TRANSCRIPT
  );
  const fabricatedCheck = checkExtractionDeterministic({
    extraction: fabricated,
    transcript: INJECTED_TRANSCRIPT,
    rawQuotes: [{ text: "I will wire two million tomorrow.", topic: "budget" }],
  });

  const swapped = parseExtraction(
    {
      summary: "Setter locked Maya in.",
      quotes: [{ text: "We'll lock you in today for twelve thousand.", topic: "commitment" }],
      stated_objection: { state: "present", text: "The price is the wall" },
      budget_signal: { state: "absent", text: null },
      timeline_signal: { state: "present", text: "after Q1" },
      decision_process: { state: "present", text: "I need to talk to my partner" },
      next_step_agreed: { state: "absent", text: null },
      objections: [{ type: "price", verbatim: "The price is the wall" }],
    },
    INJECTED_TRANSCRIPT
  );
  const swappedCheck = checkExtractionDeterministic({
    extraction: swapped,
    transcript: INJECTED_TRANSCRIPT,
  });

  const unsupported = checkExtractionDeterministic({
    extraction: {
      ...emptyExtraction(),
      summary: "Maya committed to twelve thousand this week.",
      timelineSignal: { state: "present", text: "after Q1" },
    },
    transcript: INJECTED_TRANSCRIPT,
  });

  const invented = checkDraftDeterministic({
    body: "Great news — you booked Thursday and you committed to the twelve thousand package.",
    subject: null,
    channel: "sms",
    transcript: INJECTED_TRANSCRIPT,
    quotes: [],
    statedObjection: "The price is the wall",
    nextStep: null,
    nextStepState: "absent",
    budgetState: "absent",
    timelineState: "present",
    decisionState: "present",
    voice: VOICE,
  });

  return [
    {
      type: "fabricated_quote",
      caught: fabricatedCheck.faults.some((item) => item.code === "fabricated_quote"),
      stage: fabricatedCheck.faults.length ? "deterministic" : "none",
      codes: fabricatedCheck.faults.map((item) => item.code),
    },
    {
      type: "wrong_speaker",
      caught: swappedCheck.faults.some((item) => item.code === "wrong_speaker"),
      stage: swappedCheck.faults.length ? "deterministic" : "none",
      codes: swappedCheck.faults.map((item) => item.code),
    },
    {
      type: "unsupported_claim",
      caught: unsupported.faults.some((item) => item.code === "unsupported_claim"),
      stage: unsupported.faults.length ? "deterministic" : "none",
      codes: unsupported.faults.map((item) => item.code),
    },
    {
      type: "invented_commitment",
      caught:
        invented.faults.some((item) => item.what.includes("invented_commitment")) ||
        invented.faults.some((item) => item.code === "ungrounded_topic") ||
        checkDraftQuality({
          body: "Great news — you booked Thursday and you committed to the twelve thousand package.",
          subject: null,
          channel: "sms",
          transcript: INJECTED_TRANSCRIPT,
          quotes: [],
          statedObjection: "The price is the wall",
          nextStep: null,
          nextStepState: "absent",
          budgetState: "absent",
          timelineState: "present",
          decisionState: "present",
          voice: VOICE,
        }).ok === false,
      stage: invented.ok ? "none" : "deterministic",
      codes: invented.faults.map((item) => item.code),
    },
  ];
}

export function injectedSuitePassed(results: InjectedFaultResult[] = runInjectedFaultSuite()): boolean {
  return results.every((item) => item.caught);
}
