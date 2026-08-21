export type BannedHit = { phrase: string; kind: "opening" | "filler" | "corporate" };

const OPENINGS: Array<{ re: RegExp; phrase: string }> = [
  { re: /\bi hope this (message|email|note) finds you well\b/i, phrase: "I hope this message finds you well" },
  { re: /\bi hope you('re| are) (doing |well)\b/i, phrase: "I hope you're doing well" },
  { re: /\bi wanted to reach out\b/i, phrase: "I wanted to reach out" },
  { re: /\bjust circling back\b/i, phrase: "just circling back" },
  { re: /\bcircling back\b/i, phrase: "circling back" },
  { re: /\btouching base\b/i, phrase: "touching base" },
  { re: /\bfollowing up on our conversation\b/i, phrase: "following up on our conversation" },
  { re: /\bas we discussed\b/i, phrase: "as we discussed" },
];

const CORPORATE = [
  "leverage",
  "utilize",
  "synergy",
  "streamline",
  "robust",
  "seamless",
  "journey",
  "solution",
];

export function findBannedPhrases(body: string): BannedHit[] {
  const hits: BannedHit[] = [];
  for (const item of OPENINGS) {
    if (item.re.test(body)) hits.push({ phrase: item.phrase, kind: "opening" });
  }
  const lower = ` ${body.toLowerCase()} `;
  for (const word of CORPORATE) {
    const re = new RegExp(`\\b${word}\\b`, "i");
    if (re.test(lower)) hits.push({ phrase: word, kind: "corporate" });
  }
  return hits;
}

export function hasThreeItemList(body: string): boolean {
  if (/\b1[\.)]\s+[\s\S]+\b2[\.)]\s+[\s\S]+\b3[\.)]\s+/.test(body)) return true;
  const sentences = body.split(/(?<=[.!?])\s+/);
  return sentences.some((sentence) => {
    const commas = (sentence.match(/,/g) ?? []).length;
    return commas >= 2 && /\band\b/i.test(sentence);
  });
}
