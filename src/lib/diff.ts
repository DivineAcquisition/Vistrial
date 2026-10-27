export type DiffLine = { type: "same" | "added" | "removed"; text: string };

/** Line diff by longest common subsequence. Fine for asset bodies; capped so a huge body cannot stall the page. */
export function lineDiff(before: string, after: string, maxLines = 2000): DiffLine[] {
  const a = before.split("\n").slice(0, maxLines);
  const b = after.split("\n").slice(0, maxLines);
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ type: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      lines.push({ type: "removed", text: a[i] });
      i += 1;
    } else {
      lines.push({ type: "added", text: b[j] });
      j += 1;
    }
  }
  for (; i < a.length; i += 1) lines.push({ type: "removed", text: a[i] });
  for (; j < b.length; j += 1) lines.push({ type: "added", text: b[j] });
  return lines;
}
