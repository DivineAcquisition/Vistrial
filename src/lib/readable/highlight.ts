/**
 * Highlighting inside quoted text. A highlight marks words that are really in the text: each needle is looked
 * for as written (case and spacing aside) and a needle that is not there marks nothing. No model decides where
 * a mark goes; the kinds come from fields the result already has (a pain, a proof quote, a button).
 */
export const HIGHLIGHT_KINDS = ["pain", "fix", "proof", "cta", "qualifier", "price"] as const;
export type HighlightKind = (typeof HIGHLIGHT_KINDS)[number];

/** The legend: the name of each kind and what it marks. */
export const HIGHLIGHT_WORDS: Record<HighlightKind, { name: string; means: string }> = {
  pain: { name: "Pain", means: "A problem the page names for its reader." },
  fix: { name: "Fix", means: "The page's answer to a pain." },
  proof: { name: "Proof", means: "A result or a customer's words the page shows." },
  cta: { name: "Call to action", means: "A button or the wording that asks for the next step." },
  qualifier: { name: "Qualifier", means: "The line that says who the page is for." },
  price: { name: "Price", means: "What it costs, as the page states it." },
};

export type Needle = { kind: HighlightKind; text: string };
export type Segment = { text: string; kind: HighlightKind | null };

/** Positions in `text` of each character once runs of white space are folded to one space and case is dropped. */
function folded(text: string) {
  let out = "";
  const at: number[] = [];
  let space = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/\s/.test(char)) {
      if (!space && out.length > 0) {
        out += " ";
        at.push(index);
      }
      space = true;
    } else {
      out += char.toLowerCase();
      at.push(index);
      space = false;
    }
  }
  return { out, at };
}

/**
 * Splits text into marked and unmarked runs. Needles shorter than four characters are ignored (too easy to hit
 * by accident), the first occurrence of each is marked, and where two overlap the earlier, then longer, wins.
 */
export function markText(text: string, needles: readonly Needle[]): Segment[] {
  if (!text) return [];
  const hay = folded(text);
  const spans: { from: number; to: number; kind: HighlightKind }[] = [];
  for (const needle of needles) {
    const want = folded(needle.text).out.trim();
    if (want.length < 4) continue;
    const found = hay.out.indexOf(want);
    if (found < 0) continue;
    spans.push({ from: hay.at[found], to: hay.at[found + want.length - 1] + 1, kind: needle.kind });
  }
  spans.sort((a, b) => a.from - b.from || b.to - b.from - (a.to - a.from));
  const segments: Segment[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.from < cursor) continue;
    if (span.from > cursor) segments.push({ text: text.slice(cursor, span.from), kind: null });
    segments.push({ text: text.slice(span.from, span.to), kind: span.kind });
    cursor = span.to;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), kind: null });
  return segments;
}

/** The kinds that were really marked, in legend order, so a legend never names a kind that is not on screen. */
export function kindsMarked(rows: readonly Segment[][]): HighlightKind[] {
  const seen = new Set(rows.flat().flatMap((row) => (row.kind ? [row.kind] : [])));
  return HIGHLIGHT_KINDS.filter((kind) => seen.has(kind));
}
