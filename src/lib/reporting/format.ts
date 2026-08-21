/** Truncate toward zero so a success rate is never rounded up. */
export function truncRate(value: number | null | undefined, decimals = 1): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const factor = 10 ** decimals;
  return Math.trunc(value * factor) / factor;
}

export function formatPerHundred(value: number | null | undefined, tooSmall: boolean): string {
  if (tooSmall || value === null || value === undefined) return "Sample too small";
  const truncated = truncRate(value, 1);
  if (truncated === null) return "\u2014";
  return `${truncated.toFixed(1)} per 100`;
}

export function formatPct(value: number | null | undefined, tooSmall: boolean): string {
  if (tooSmall || value === null || value === undefined) return "Sample too small";
  const truncated = truncRate(value, 1);
  if (truncated === null) return "\u2014";
  return `${truncated.toFixed(1)}%`;
}

export function formatSample(k: number, n: number): string {
  return `${k.toLocaleString("en-US")} of ${n.toLocaleString("en-US")}`;
}

export function formatMinutes(value: number | null | undefined): string {
  if (value === null || value === undefined) return "\u2014";
  const truncated = truncRate(value, 1);
  if (truncated === null) return "\u2014";
  return `${truncated.toFixed(1)} min`;
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return "\u2014";
  return value.toLocaleString("en-US");
}

export function formatComputedAt(iso: string | null | undefined): string {
  if (!iso) return "Not yet computed";
  return new Date(iso).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}
