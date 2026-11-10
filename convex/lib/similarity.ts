/**
 * How close two pieces of copy are, in code. Used to hold a creative to "same structure, new words": a
 * reference ad's ideas and structure may be modelled, its wording may not be reused. Thresholds are
 * engineering starting points, not legal standards.
 */

/** Lower-case words with punctuation dropped, so "Don't wait!" and "dont wait" read the same. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** The longest run of consecutive words the two texts share, as the words themselves. */
export function longestSharedRun(a: string, b: string): string[] {
  const left = words(a);
  const right = words(b);
  let best = 0;
  let end = 0;
  // Rolling rows of the classic longest-common-substring table, over words.
  let previous = new Array<number>(right.length + 1).fill(0);
  for (let i = 1; i <= left.length; i += 1) {
    const row = new Array<number>(right.length + 1).fill(0);
    for (let j = 1; j <= right.length; j += 1) {
      if (left[i - 1] === right[j - 1]) {
        row[j] = previous[j - 1] + 1;
        if (row[j] > best) {
          best = row[j];
          end = i;
        }
      }
    }
    previous = row;
  }
  return left.slice(end - best, end);
}

function grams(list: string[], size: number) {
  const out = new Set<string>();
  for (let i = 0; i + size <= list.length; i += 1) out.add(list.slice(i, i + size).join(" "));
  return out;
}

/** The share of `text`'s word groups of `size` that also appear in `reference`, from 0 to 1. */
export function sharedPhraseShare(text: string, reference: string, size = 4): number {
  const mine = grams(words(text), size);
  if (mine.size === 0) return 0;
  const theirs = grams(words(reference), size);
  let shared = 0;
  for (const gram of mine) if (theirs.has(gram)) shared += 1;
  return shared / mine.size;
}

/** True when `phrase` appears in `text` as whole words. */
export function containsPhrase(text: string, phrase: string): boolean {
  const needle = words(phrase).join(" ");
  if (!needle) return false;
  return ` ${words(text).join(" ")} `.includes(` ${needle} `);
}
