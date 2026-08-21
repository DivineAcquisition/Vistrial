import { lengthRatio, wordEditDistance } from "@/lib/follow-up/edit-distance";

export type VoiceSuggestionDraft = {
  kind: "shorter" | "less_formal" | "drop_phrase";
  phrase?: string;
  sampleSize: number;
  evidence: string;
};

const FORMAL_TOKENS = /\b(please|would|kindly|regarding|per our|at your earliest)\b/gi;

function droppedPhrases(generated: string, sent: string): string[] {
  const gen = generated.toLowerCase();
  const out = sent.toLowerCase();
  const words = gen.split(/\s+/).filter((word) => word.length > 3);
  const phrases: string[] = [];
  for (let i = 0; i < words.length - 2; i += 1) {
    const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    if (gen.includes(phrase) && !out.includes(phrase)) phrases.push(phrase);
  }
  return phrases;
}

export function suggestionsFromEdits(
  pairs: Array<{ generated: string; sent: string }>
): VoiceSuggestionDraft[] {
  const edited = pairs.filter((pair) => pair.generated.trim() !== pair.sent.trim());
  if (edited.length < 5) return [];

  const out: VoiceSuggestionDraft[] = [];
  const shorterCount = edited.filter((pair) => lengthRatio(pair.generated, pair.sent) < 0.75).length;
  if (shorterCount / edited.length >= 0.6) {
    out.push({
      kind: "shorter",
      sampleSize: shorterCount,
      evidence: `${shorterCount} of ${edited.length} sent messages were cut to under 75% of the generated length.`,
    });
  }

  const formalDrop = edited.filter((pair) => {
    const before = (pair.generated.match(FORMAL_TOKENS) ?? []).length;
    const after = (pair.sent.match(FORMAL_TOKENS) ?? []).length;
    return before > 0 && after < before;
  }).length;
  if (formalDrop / edited.length >= 0.5) {
    out.push({
      kind: "less_formal",
      sampleSize: formalDrop,
      evidence: `${formalDrop} of ${edited.length} edits dropped formal phrasing.`,
    });
  }

  const phraseCounts = new Map<string, number>();
  for (const pair of edited) {
    const unique = new Set(droppedPhrases(pair.generated, pair.sent));
    for (const phrase of unique) {
      phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
    }
  }
  for (const [phrase, count] of phraseCounts) {
    if (count >= 3) {
      out.push({
        kind: "drop_phrase",
        phrase,
        sampleSize: count,
        evidence: `"${phrase}" was removed from ${count} sent messages.`,
      });
    }
  }

  return out;
}

export function editDistanceFor(generated: string, sent: string): number {
  return wordEditDistance(generated, sent);
}
