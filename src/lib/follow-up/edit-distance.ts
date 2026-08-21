/** Word-level Levenshtein distance between generated and sent copy. */
export function wordEditDistance(a: string, b: string): number {
  const left = tokenize(a);
  const right = tokenize(b);
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  const prev = new Array<number>(right.length + 1);
  const cur = new Array<number>(right.length + 1);
  for (let j = 0; j <= right.length; j += 1) prev[j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= right.length; j += 1) prev[j] = cur[j];
  }
  return prev[right.length];
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function lengthRatio(generated: string, sent: string): number {
  const a = generated.trim().length;
  if (a === 0) return sent.trim().length === 0 ? 1 : 0;
  return sent.trim().length / a;
}
