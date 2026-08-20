import type { ExtractedObjection, VerbatimQuote } from "@/lib/transcripts/types";

/** Quotes shorter than this cannot be verified as prospect language. */
export const MIN_VERBATIM_CHARS = 12;

export function normalizeForQuoteMatch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function quoteAppearsInTranscript(quote: string, transcript: string): boolean {
  const needle = normalizeForQuoteMatch(quote);
  if (needle.length < MIN_VERBATIM_CHARS) return false;
  return normalizeForQuoteMatch(transcript).includes(needle);
}

export function keepVerbatimQuotes(quotes: VerbatimQuote[], transcript: string): VerbatimQuote[] {
  const seen = new Set<string>();
  const kept: VerbatimQuote[] = [];
  for (const quote of quotes) {
    const text = quote.text.trim();
    const topic = quote.topic.trim() || "situation";
    if (!quoteAppearsInTranscript(text, transcript)) continue;
    const key = normalizeForQuoteMatch(text);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push({ text, topic });
  }
  return kept;
}

export function keepVerbatimObjections(
  objections: ExtractedObjection[],
  transcript: string
): ExtractedObjection[] {
  const seen = new Set<string>();
  const kept: ExtractedObjection[] = [];
  for (const objection of objections) {
    const verbatim = objection.verbatim.trim();
    if (!quoteAppearsInTranscript(verbatim, transcript)) continue;
    const key = `${objection.type}:${normalizeForQuoteMatch(verbatim)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push({ type: objection.type, verbatim });
  }
  return kept;
}

export function clipTranscriptWindow(
  transcript: string,
  headChars: number,
  tailChars: number
): { text: string; truncated: boolean } {
  if (transcript.length <= headChars + tailChars) {
    return { text: transcript, truncated: false };
  }
  return {
    text: `${transcript.slice(0, headChars)}\n\n[...middle omitted...]\n\n${transcript.slice(-tailChars)}`,
    truncated: true,
  };
}
