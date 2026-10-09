import type { Passage } from "@/lib/scribe/passages";

/**
 * A lead saying on a call that they want no more contact. Only the lead's own
 * passages count (or unattributed ones when the speaker is unknown); the
 * team's words never opt a lead out.
 */

const PHRASES: RegExp[] = [
  /\b(stop|quit) (calling|texting|messaging|emailing|contacting) me\b/i,
  /\b(don'?t|do not|never) (call|text|message|email|contact) me (again|anymore|any more)\b/i,
  /\b(take|remove|delete) me (off|from) (your|the) (list|database|system|calls)\b/i,
  /\bput me on (your|the) do not call list\b/i,
  /\bi('?m| am) (asking you to|telling you to) stop\b/i,
  /\bunsubscribe me\b/i,
  /\blose my number\b/i,
];

const NEGATED = /\b(not|never|didn'?t|don'?t|wouldn'?t) (say|ask|want you to)\b/i;

export type SpokenOptOut = { seq: number; word: string };

export function findSpokenOptOut(passages: Passage[], configuredWords: string[] = []): SpokenOptOut | null {
  const words = configuredWords.map((w) => w.trim().toUpperCase()).filter(Boolean);
  for (const passage of passages) {
    if (passage.speaker === "team") continue;
    const body = passage.body;
    if (!NEGATED.test(body) && PHRASES.some((re) => re.test(body))) {
      return { seq: passage.seq, word: "SPOKEN" };
    }
    const bare = body.replace(/[^a-z\s]/gi, " ").trim().toUpperCase();
    if (bare && bare.split(/\s+/).length <= 3 && words.includes(bare)) {
      return { seq: passage.seq, word: bare.slice(0, 30) };
    }
  }
  return null;
}
