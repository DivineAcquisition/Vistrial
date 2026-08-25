const STOP = new Set([
  "the",
  "and",
  "for",
  "that",
  "this",
  "with",
  "you",
  "your",
  "have",
  "has",
  "was",
  "were",
  "are",
  "but",
  "not",
  "from",
  "they",
  "them",
  "their",
  "our",
  "out",
  "just",
  "like",
  "about",
  "what",
  "when",
  "how",
  "who",
  "why",
  "can",
  "will",
  "would",
  "could",
  "should",
  "going",
  "gonna",
  "yeah",
  "okay",
  "right",
  "know",
  "think",
  "want",
  "need",
  "get",
  "got",
  "one",
  "also",
  "really",
  "very",
  "there",
  "here",
  "then",
  "than",
  "some",
  "more",
  "into",
  "over",
  "been",
  "being",
]);

export type PhraseContrast = {
  phrase: string;
  closedN: number;
  lostN: number;
  closedShare: number;
  lostShare: number;
};

function tokens(text: string): string[] {
  return text
    .replace(/^[A-Za-z][A-Za-z0-9 .'\-]{0,79}:\s*/gm, " ")
    .toLowerCase()
    .replace(/[0-9]+@[^\s]+/g, " ")
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/g, " ")
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, " ")
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP.has(token));
}

function ngrams(text: string, n: number): string[] {
  const parts = tokens(text);
  const out: string[] = [];
  for (let i = 0; i <= parts.length - n; i += 1) {
    out.push(parts.slice(i, i + n).join(" "));
  }
  return out;
}

function counts(texts: string[], n: number): Map<string, number> {
  const map = new Map<string, number>();
  for (const text of texts) {
    const seen = new Set<string>();
    for (const gram of ngrams(text, n)) {
      if (seen.has(gram)) continue;
      seen.add(gram);
      map.set(gram, (map.get(gram) ?? 0) + 1);
    }
  }
  return map;
}

/**
 * Phrases that appeared in a larger share of closed calls than lost calls.
 * Descriptive only — this is not a script.
 */
export function contrastingPhrases(args: {
  closedTranscripts: string[];
  lostTranscripts: string[];
  minClosed: number;
}): PhraseContrast[] {
  const closedN = args.closedTranscripts.length;
  const lostN = args.lostTranscripts.length;
  if (closedN < args.minClosed || lostN < args.minClosed) return [];

  const closed = counts(args.closedTranscripts, 3);
  const lost = counts(args.lostTranscripts, 3);
  const rows: PhraseContrast[] = [];
  for (const [phrase, nClosed] of closed) {
    if (nClosed < 5) continue;
    const nLost = lost.get(phrase) ?? 0;
    const closedShare = nClosed / closedN;
    const lostShare = nLost / lostN;
    if (closedShare >= lostShare * 2 && closedShare - lostShare >= 0.15) {
      rows.push({ phrase, closedN: nClosed, lostN: nLost, closedShare, lostShare });
    }
  }
  rows.sort((a, b) => b.closedShare - b.lostShare - (a.closedShare - a.lostShare));
  return rows.slice(0, 8);
}

export function phraseFindingStatement(row: PhraseContrast, closedN: number, lostN: number): string {
  return `In your business, among ${closedN} closed and ${lostN} lost calls in comparable score bands, the phrasing “${row.phrase}” showed up on ${row.closedN} of the closed calls and ${row.lostN} of the lost ones. That is a description of the recordings, not a script to read.`;
}
