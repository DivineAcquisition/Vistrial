import { findBannedPhrases, hasThreeItemList } from "@/lib/follow-up/banned";
import { LENGTH_MARGIN } from "@/lib/follow-up/constants";
import type {
  FollowUpChannel,
  QualityFailure,
  QualityResult,
  VoiceProfile,
} from "@/lib/follow-up/types";
import { quoteAppearsInTranscript } from "@/lib/transcripts/quotes";

export type QualityInput = {
  body: string;
  subject?: string | null;
  channel: FollowUpChannel;
  transcript: string;
  quotes: string[];
  statedObjection: string | null;
  nextStep: string | null;
  nextStepState: "absent" | "unclear" | "present";
  budgetState: "absent" | "unclear" | "present";
  timelineState: "absent" | "unclear" | "present";
  decisionState: "absent" | "unclear" | "present";
  voice: VoiceProfile;
};

const BUDGET_TOPIC =
  /\b(budget|afford(?:s|ed|ing)?|price(?:d|s)?|investment|how much|cost(?:s|ing)?|payment plan|\b\d+\s*k\b)\b/i;
const TIMELINE_TOPIC = /\b(timeline|by q[1-4]|this quarter|next month|when (?:we|you) (?:start|begin|launch))\b/i;
const DECISION_TOPIC = /\b(decision[- ]maker|my partner|spouse|need to talk (?:it )?over|committee)\b/i;

function quotedSpans(body: string): string[] {
  const spans: string[] = [];
  const re = /[“"]([^”"]{12,})[”"]/g;
  let match: RegExpExecArray | null = re.exec(body);
  while (match) {
    spans.push(match[1]);
    match = re.exec(body);
  }
  return spans;
}

function includesSpan(body: string, span: string | null, min = 12): boolean {
  if (!span) return false;
  const needle = span.trim();
  if (needle.length < min) return body.toLowerCase().includes(needle.toLowerCase());
  return body.toLowerCase().includes(needle.toLowerCase());
}

function greetingPresent(body: string): boolean {
  const first = body.trim().split(/\n/)[0] ?? "";
  return /^(hi|hey|hello|good (morning|afternoon|evening))\b[:,]?\s+\S+/i.test(first.trim());
}

function signoffPresent(body: string): boolean {
  const lines = body.trim().split(/\n/).map((line) => line.trim()).filter(Boolean);
  const last = lines[lines.length - 1] ?? "";
  const prev = lines[lines.length - 2] ?? "";
  if (/^(thanks|thank you|best|regards|cheers|talk soon)[,!.]?$/i.test(last)) return true;
  if (/^(best|thanks|thank you|regards),?$/i.test(prev) && last.split(/\s+/).length <= 4) return true;
  return false;
}

function loadBearing(input: QualityInput): boolean {
  const body = input.body;
  if (input.quotes.some((quote) => includesSpan(body, quote, 12))) return true;
  if (includesSpan(body, input.statedObjection, 12)) return true;
  if (input.nextStepState === "present" && includesSpan(body, input.nextStep, 12)) return true;

  const quoted = quotedSpans(body);
  if (quoted.some((span) => quoteAppearsInTranscript(span, input.transcript))) return true;
  return false;
}

export function checkDraftQuality(input: QualityInput): QualityResult {
  const failures: QualityFailure[] = [];
  const text = input.channel === "email" && input.subject ? `${input.subject}\n${input.body}` : input.body;

  for (const hit of findBannedPhrases(text)) {
    failures.push({
      type: "banned_phrase",
      detail: hit.phrase,
    });
  }
  if (hasThreeItemList(input.body)) {
    failures.push({ type: "banned_phrase", detail: "three-item list" });
  }
  for (const word of input.voice.bannedWords) {
    const trimmed = word.trim();
    if (!trimmed) continue;
    const re = new RegExp(`\\b${trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(input.body)) {
      failures.push({ type: "banned_phrase", detail: trimmed });
    }
  }

  for (const quote of quotedSpans(input.body)) {
    if (!quoteAppearsInTranscript(quote, input.transcript)) {
      failures.push({ type: "unverified_quote", detail: quote.slice(0, 80) });
    }
  }
  for (const quote of input.quotes) {
    if (includesSpan(input.body, quote, 12) && !quoteAppearsInTranscript(quote, input.transcript)) {
      failures.push({ type: "unverified_quote", detail: quote.slice(0, 80) });
    }
  }

  if (input.budgetState !== "present" && BUDGET_TOPIC.test(input.body)) {
    failures.push({ type: "ungrounded_topic", detail: "budget" });
  }
  if (input.timelineState !== "present" && TIMELINE_TOPIC.test(input.body)) {
    failures.push({ type: "ungrounded_topic", detail: "timeline" });
  }
  if (input.decisionState !== "present" && DECISION_TOPIC.test(input.body)) {
    failures.push({ type: "ungrounded_topic", detail: "decision_process" });
  }
  if (input.nextStepState !== "present") {
    if (/\b(you (?:agreed|committed|said you'd)|we('re| are) locked in|you booked)\b/i.test(input.body)) {
      failures.push({ type: "ungrounded_topic", detail: "invented_commitment" });
    }
  }

  if (!loadBearing(input)) {
    failures.push({
      type: "no_lead_specific",
      detail: "no call-specific element",
    });
  }

  const target = input.channel === "sms" ? input.voice.smsMaxChars : input.voice.emailMaxChars;
  if (input.body.trim().length > Math.round(target * LENGTH_MARGIN)) {
    failures.push({
      type: "length",
      detail: `${input.body.trim().length} chars vs ${target} target`,
    });
  }

  if (!input.voice.useGreeting && greetingPresent(input.body)) {
    failures.push({ type: "greeting", detail: "greeting present while profile excludes it" });
  }
  if (!input.voice.useSignoff && signoffPresent(input.body)) {
    failures.push({ type: "signoff", detail: "sign-off present while profile excludes it" });
  }

  if (failures.length === 0) return { ok: true };
  const seen = new Set<string>();
  const unique = failures.filter((item) => {
    const key = `${item.type}:${item.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ok: false, failures: unique };
}
