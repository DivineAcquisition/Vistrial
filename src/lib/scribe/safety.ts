import type { Passage } from "@/lib/scribe/passages";

/**
 * Situations a person must look at before anything automated happens next.
 * When one is found the case file is held, the run ends needing a person, and
 * no follow-up is drafted. Matches return the category and passage number
 * only, never the words.
 */

export type SensitiveCategory = "self_harm" | "medical_emergency" | "violence" | "abuse" | "legal_threat";

export const SENSITIVE_LABELS: Record<SensitiveCategory, string> = {
  self_harm: "The lead may be at risk of harming themselves.",
  medical_emergency: "The lead described what may be a medical emergency.",
  violence: "Someone on the call talked about violence.",
  abuse: "The lead may be describing abuse.",
  legal_threat: "The lead mentioned legal action against the business.",
};

const PATTERNS: Array<{ category: SensitiveCategory; re: RegExp }> = [
  { category: "self_harm", re: /\b(kill(ing)? myself|suicid(e|al)|end(ing)? my (own )?life|hurt(ing)? myself|don'?t want to (live|be alive)|self[- ]harm)\b/i },
  { category: "medical_emergency", re: /\b(chest pains?|can'?t breathe|cannot breathe|overdos(e|ed|ing)|having a (stroke|seizure|heart attack)|call(ed)? (an )?ambulance|anaphyla(xis|ctic))\b/i },
  { category: "violence", re: /\b(i('?m| am)? (going to|gonna) (kill|hurt|shoot|beat) (you|him|her|them)|bring a (gun|weapon))\b/i },
  { category: "abuse", re: /\b((he|she|they) (hits?|beats?|hurts?) me|being abused|abusive (husband|wife|partner|boyfriend|girlfriend)|domestic violence)\b/i },
  { category: "legal_threat", re: /\b(my (lawyer|attorney)|(sue|suing) (you|your company|the business)|file a (lawsuit|complaint with the)|legal action)\b/i },
];

export type SensitiveFinding = { category: SensitiveCategory; seq: number };

export function findSensitive(passages: Passage[]): SensitiveFinding[] {
  const found: SensitiveFinding[] = [];
  const seen = new Set<SensitiveCategory>();
  for (const passage of passages) {
    if (passage.speaker === "team") continue;
    for (const { category, re } of PATTERNS) {
      if (seen.has(category)) continue;
      if (re.test(passage.body)) {
        seen.add(category);
        found.push({ category, seq: passage.seq });
      }
    }
  }
  return found;
}

export function isSensitiveCategory(value: unknown): value is SensitiveCategory {
  return typeof value === "string" && value in SENSITIVE_LABELS;
}
