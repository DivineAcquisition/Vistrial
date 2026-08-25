import type { ParsedExtraction } from "@/lib/transcripts/types";
import { normalizeForQuoteMatch, quoteAppearsInTranscript } from "@/lib/transcripts/quotes";
import { fault, uniqueFaults } from "@/lib/verification/faults";
import type { DeterministicCheckResult, VerificationFault } from "@/lib/verification/types";

const REP_SPEAKER = /^(setter|closer|rep|coach|you|vistrial)\b/i;
const BUDGET_TOPIC =
  /\b(budget|afford(?:s|ed|ing)?|price(?:d|s)?|investment|how much|cost(?:s|ing)?|payment plan|\b\d+\s*k\b)\b/i;
const TIMELINE_TOPIC =
  /\b(timeline|after q[1-4]|this quarter|next month|when (?:we|you|i) (?:start|begin|launch)|by q[1-4])\b/i;
const DECISION_TOPIC =
  /\b(decision[- ]maker|my partner|spouse|husband|wife|need to talk (?:it )?over|committee)\b/i;
const OBJECTION_TOPIC =
  /\b(too expensive|the price is|can't afford|not interested|need to think|have to talk to)\b/i;
const NEXT_STEP_TOPIC =
  /\b(i'll send|send the (?:link|invite)|book(?:ed|ing)?|thursday|tomorrow|next week|calendar)\b/i;
const COMMIT_CLAIM =
  /\b(committed to|agreed to pay|will (?:wire|pay|send) \$?\d|locked in|signed up)\b/i;

export type SpeakerLine = { speaker: string; text: string };

export function parseSpeakerLines(transcript: string): SpeakerLine[] {
  const lines: SpeakerLine[] = [];
  for (const raw of transcript.split(/\n+/)) {
    const match = raw.match(/^([^:]{1,40}):\s*(.+)$/);
    if (!match) continue;
    const speaker = match[1].trim();
    const text = match[2].trim();
    if (speaker && text) lines.push({ speaker, text });
  }
  return lines;
}

function quoteSpeaker(quote: string, lines: SpeakerLine[]): SpeakerLine | null {
  const needle = normalizeForQuoteMatch(quote);
  if (needle.length < 12) return null;
  const hits = lines.filter((line) => normalizeForQuoteMatch(line.text).includes(needle));
  if (hits.length === 0) return null;
  return hits[0];
}

function absentHasContent(
  state: string,
  topic: RegExp,
  transcript: string,
  code: string,
  where: string,
  what: string
): VerificationFault | null {
  if (state !== "absent") return null;
  if (!topic.test(transcript)) return null;
  return fault(code, where, what);
}

/**
 * Stage 1 for extraction. Drops fabricated quotes (already done by parse) and
 * names remaining deterministic faults. Does not call a model.
 */
export function checkExtractionDeterministic(args: {
  extraction: ParsedExtraction;
  transcript: string;
  rawQuotes?: Array<{ text: string; topic: string }>;
}): DeterministicCheckResult {
  const faults: VerificationFault[] = [];
  const transcript = args.transcript;
  const lines = parseSpeakerLines(transcript);

  const rawQuotes = args.rawQuotes ?? args.extraction.quotes;
  for (const quote of rawQuotes) {
    if (!quoteAppearsInTranscript(quote.text, transcript)) {
      faults.push(
        fault("fabricated_quote", `quotes.${quote.topic}`, `Quote is not a verbatim substring: “${quote.text.slice(0, 80)}”`)
      );
    } else {
      const spoken = quoteSpeaker(quote.text, lines);
      if (spoken && REP_SPEAKER.test(spoken.speaker)) {
        faults.push(
          fault(
            "wrong_speaker",
            `quotes.${quote.topic}`,
            `“${quote.text.slice(0, 80)}” is spoken by ${spoken.speaker}, not the prospect.`
          )
        );
      }
    }
  }

  if (args.extraction.summary && COMMIT_CLAIM.test(args.extraction.summary)) {
    const summary = args.extraction.summary;
    if (!normalizeForQuoteMatch(transcript).includes(normalizeForQuoteMatch(summary).slice(0, 40))) {
      const money = summary.match(/\$?\d[\d,]*(?:\.\d+)?k?/i);
      if (money && !normalizeForQuoteMatch(transcript).includes(normalizeForQuoteMatch(money[0]))) {
        faults.push(
          fault("unsupported_claim", "summary", `Summary asserts ${money[0]} which the transcript does not contain.`)
        );
      } else if (!quoteAppearsInTranscript(summary.slice(0, 80), transcript) && COMMIT_CLAIM.test(summary)) {
        faults.push(
          fault("unsupported_claim", "summary", "Summary asserts a commitment the transcript does not contain.")
        );
      }
    }
  }

  const missedObjection = absentHasContent(
    args.extraction.statedObjection.state,
    OBJECTION_TOPIC,
    transcript,
    "missed_objection",
    "stated_objection",
    "The transcript raises an objection but the extraction marked it absent."
  );
  if (missedObjection) faults.push(missedObjection);

  const missedBudget = absentHasContent(
    args.extraction.budgetSignal.state,
    BUDGET_TOPIC,
    transcript,
    "wrongly_absent",
    "budget_signal",
    "Budget was discussed in the transcript but marked absent."
  );
  if (missedBudget) faults.push(missedBudget);

  const missedTimeline = absentHasContent(
    args.extraction.timelineSignal.state,
    TIMELINE_TOPIC,
    transcript,
    "wrongly_absent",
    "timeline_signal",
    "Timeline was discussed in the transcript but marked absent."
  );
  if (missedTimeline) faults.push(missedTimeline);

  const missedDecision = absentHasContent(
    args.extraction.decisionProcess.state,
    DECISION_TOPIC,
    transcript,
    "wrongly_absent",
    "decision_process",
    "Decision process was discussed in the transcript but marked absent."
  );
  if (missedDecision) faults.push(missedDecision);

  const missedNext = absentHasContent(
    args.extraction.nextStepAgreed.state,
    NEXT_STEP_TOPIC,
    transcript,
    "wrongly_absent",
    "next_step_agreed",
    "A next step was discussed in the transcript but marked absent."
  );
  if (missedNext) faults.push(missedNext);

  for (const signal of [
    { name: "stated_objection", signal: args.extraction.statedObjection },
    { name: "budget_signal", signal: args.extraction.budgetSignal },
    { name: "timeline_signal", signal: args.extraction.timelineSignal },
    { name: "decision_process", signal: args.extraction.decisionProcess },
    { name: "next_step_agreed", signal: args.extraction.nextStepAgreed },
  ] as const) {
    if (signal.signal.state === "absent" && signal.signal.text) {
      faults.push(fault("shape", signal.name, "Absent fields must not carry text."));
    }
    if (signal.signal.state === "present" && !signal.signal.text) {
      faults.push(fault("shape", signal.name, "Present fields must carry text."));
    }
    if (signal.signal.text && !quoteAppearsInTranscript(signal.signal.text, transcript) && signal.signal.text.length >= 12) {
      faults.push(
        fault("unsupported_claim", signal.name, "Field text is not a verbatim substring of the transcript.")
      );
    }
  }

  return { ok: uniqueFaults(faults).length === 0, faults: uniqueFaults(faults) };
}

export const EXTRACTION_VERIFIER_SYSTEM = `You find faults in a call extraction. You do not approve. You do not praise. You were not shown how the extraction was produced and you must not guess.

Look only at the transcript and the extraction JSON. Name what is wrong and where:
- any claim the transcript does not support
- any significant thing said that the extraction missed
- any statement attributed to the wrong speaker (the most consequential error: it can put the rep's words in the prospect's mouth)
- any inference presented as something stated
- any objection raised but not captured

Return JSON only: {"faults":[{"code":"string","where":"string","what":"string"}]}
If you find nothing wrong, return {"faults":[]}. Do not add commentary.`;

export function extractionVerifierUser(transcript: string, extractionJson: string): string {
  return `Transcript:\n${transcript}\n\nExtraction:\n${extractionJson}`;
}
