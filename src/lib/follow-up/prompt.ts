import type { FollowUpBranch, FollowUpChannel, VoiceProfile } from "@/lib/follow-up/types";

export const DRAFT_SYSTEM_PROMPT = `You write follow-up messages for a closer who was just on a call. You draft. A human will approve. The CRM will send. Never auto-approve or auto-send.

You are not a marketing writer. You are finishing a conversation that already happened.

Non-negotiable:
- Only reference what was actually said. If a signal is absent, do not mention that topic. No budget mention unless a budget signal is present. No invented commitments. You may restate a next step the extraction captured; you may not assert an agreement that was not reached.
- Quotes must be verbatim from the provided quote list. Never paraphrase a quote.
- If the extraction is thin, write a short honest message. Do not pad.
- Personalization must be load-bearing: at least one element that could only exist because of this specific call (their words, their objection, the agreed next step, or a detail they stated). A sentence that could be sent unchanged to a different lead does not belong.
- Never open with "I hope this message finds you well" or any variant. Never "I wanted to reach out," "just circling back," "touching base," or "following up on our conversation." Never "as we discussed" — name the specific thing.
- Never use: leverage, utilize, synergy, streamline, robust, seamless, journey, solution.
- No three-item lists where the third item exists only to complete a pattern.
- Do not restate the prospect's situation in tidier language than they used. Use their vocabulary.
- Do not close with a question they cannot answer in one line.
- Varied sentence length, including fragments where natural. One idea per message, not a summary of the whole call. Direct address, plain verbs, no hedging stacks. End with a specific, easy next step.

Output JSON only:
{"body": string, "subject": string | null, "quotes_used": string[]}
subject is null for SMS. quotes_used is the verbatim quotes you actually placed in the body.`;

function channelVoice(channel: FollowUpChannel, voice: VoiceProfile): string {
  if (channel === "sms") {
    return [
      "Channel: SMS. Write this natively as a text, not as a truncated email.",
      "One or two sentences. No greeting. No sign-off.",
      `Stay near ${voice.smsMaxChars} characters. Shorter is better.`,
    ].join("\n");
  }
  const greeting = voice.useGreeting
    ? `A greeting is allowed${voice.greetingText ? `: ${voice.greetingText}` : "."}`
    : "Do not include a greeting.";
  const signoff = voice.useSignoff
    ? `A sign-off is allowed${voice.signoffText ? `: ${voice.signoffText}` : "."}`
    : "Do not include a sign-off.";
  return [
    "Channel: email. Write this natively as an email, not as an expanded SMS.",
    greeting,
    signoff,
    `Stay near ${voice.emailMaxChars} characters. One short paragraph plus a specific next step.`,
    "Subject: specific to this call, never generic.",
  ].join("\n");
}

function branchInstruction(branch: FollowUpBranch): string {
  switch (branch) {
    case "closed":
      return "Branch: closed. Confirmation and onboarding handoff only. No selling.";
    case "follow_up_scheduled":
      return "Branch: follow-up scheduled. Confirm the agreed next step and time. Restate what was agreed. Do not invent a time that is not in the extraction.";
    case "objection_hold":
      return "Branch: objection hold. Address the specific unresolved objection, using their verbatim wording. Do not argue them out of it.";
    case "no_show":
      return "Branch: no-show. Reschedule outreach. Calibrate tone to whether this is a first or repeat no-show. Do not guilt them.";
    case "not_interested":
      return "Branch: not interested. A short, graceful close-out. Do not persuade. Leave the door open without a pitch.";
    case "ghost_risk":
      return "Branch: ghost risk. The call happened but no next step was agreed. One specific, easy next step. Do not recap the whole call.";
  }
}

export function draftUserPrompt(input: {
  branch: FollowUpBranch;
  channel: FollowUpChannel;
  voice: VoiceProfile;
  noShowCount: number;
  sequencePosition: number;
  operatorInstruction?: string | null;
  previousFailure?: string | null;
  lead: {
    firstName: string | null;
    source: string | null;
    offerName: string | null;
  };
  extraction: {
    summary: string | null;
    statedObjection: string | null;
    statedObjectionState: string;
    budgetSignal: string | null;
    budgetState: string;
    timelineSignal: string | null;
    timelineState: string;
    decisionProcess: string | null;
    decisionState: string;
    nextStep: string | null;
    nextStepState: string;
    quotes: Array<{ text: string; topic: string }>;
  };
  priorOpenObjections: string[];
  readiness: { total: number | null; reasoning: string | null };
  priorTouches: Array<{ at: string; channel: string; direction: string; type: string }>;
  objectionVocabulary?: Array<{ type: string; phrasing: string; response: string | null }>;
}): string {
  const examples = input.voice.examples
    .map((item, index) => `${index + 1}. [${item.channel}] ${item.body}`)
    .join("\n");

  const quotes = input.extraction.quotes
    .map((item) => `- "${item.text}" (${item.topic})`)
    .join("\n");

  const signals = [
    `stated_objection: ${input.extraction.statedObjectionState}${input.extraction.statedObjection ? ` — ${input.extraction.statedObjection}` : ""}`,
    `budget: ${input.extraction.budgetState}${input.extraction.budgetSignal ? ` — ${input.extraction.budgetSignal}` : " — DO NOT MENTION BUDGET"}`,
    `timeline: ${input.extraction.timelineState}${input.extraction.timelineSignal ? ` — ${input.extraction.timelineSignal}` : " — DO NOT MENTION TIMELINE"}`,
    `decision_process: ${input.extraction.decisionState}${input.extraction.decisionProcess ? ` — ${input.extraction.decisionProcess}` : " — DO NOT MENTION DECISION PROCESS"}`,
    `next_step: ${input.extraction.nextStepState}${input.extraction.nextStep ? ` — ${input.extraction.nextStep}` : " — DO NOT ASSERT A COMMITMENT"}`,
  ].join("\n");

  const touches = input.priorTouches
    .slice(0, 8)
    .map((item) => `- ${item.at} ${item.direction} ${item.channel} (${item.type})`)
    .join("\n");

  return [
    branchInstruction(input.branch),
    `Sequence position: ${input.sequencePosition}. Each message is drafted independently and will be approved independently.`,
    input.branch === "no_show"
      ? `No-show count for this lead including this call: ${input.noShowCount}. ${
          input.noShowCount <= 1 ? "First no-show. Light, practical." : "Repeat no-show. Still human, slightly more direct."
        }`
      : null,
    channelVoice(input.channel, input.voice),
    `Voice profile: formality=${input.voice.formality}; contractions=${input.voice.useContractions ? "yes" : "no"}; emoji=${input.voice.emojiUsage}.`,
    input.voice.bannedWords.length ? `Do not use these words/phrases: ${input.voice.bannedWords.join(", ")}.` : null,
    examples
      ? `Real messages this client has sent. Match this voice more than the adjectives above:\n${examples}`
      : "No client examples are on file. Write short and human, not corporate.",
    `Lead first name: ${input.lead.firstName ?? "(unknown)"}. Source: ${input.lead.source ?? "(unknown)"}. Offer: ${input.lead.offerName ?? "(unknown)"}.`,
    `Call summary:\n${input.extraction.summary ?? "(thin — no summary)"}`,
    `Signals:\n${signals}`,
    quotes ? `Verbatim quotes you may use (only these):\n${quotes}` : "No verified quotes.",
    input.priorOpenObjections.length
      ? `Open objections from prior calls:\n${input.priorOpenObjections.map((item) => `- ${item}`).join("\n")}`
      : null,
    input.objectionVocabulary?.length
      ? `This workspace's usual objection wording (classify only; do not invent an objection from this list):\n${input.objectionVocabulary
          .map((item) => `- ${item.type}: "${item.phrasing}"`)
          .join("\n")}`
      : null,
    input.branch === "objection_hold" && input.objectionVocabulary?.some((item) => item.response?.trim())
      ? `Known responses this closer uses for those objections:\n${input.objectionVocabulary
          .filter((item) => item.response?.trim())
          .map((item) => `- ${item.type}: ${item.response}`)
          .join("\n")}`
      : null,
    `Readiness total: ${input.readiness.total ?? "unknown"}.`,
    touches ? `Prior touch history (no message bodies):\n${touches}` : "No prior touches recorded.",
    input.operatorInstruction ? `Operator instruction for this regeneration: ${input.operatorInstruction}` : null,
    input.previousFailure
      ? `A previous draft failed a programmatic quality check. Fix this exactly: ${input.previousFailure}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}
