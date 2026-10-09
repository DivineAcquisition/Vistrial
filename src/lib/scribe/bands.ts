export type ScoringBand = { name: string; min_score: number; meaning: string; next_step: string };

export function readBands(value: unknown): ScoringBand[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
    .map((b) => ({
      name: String(b.name ?? "").trim(),
      min_score: Number(b.min_score),
      meaning: String(b.meaning ?? "").trim(),
      next_step: String(b.next_step ?? "").trim(),
    }))
    .filter((b) => b.name && Number.isFinite(b.min_score));
}

/** The band is always derived from the number, never chosen by a model. */
export function bandForScore(score: number | null, bands: ScoringBand[]): ScoringBand | null {
  if (score == null || !Number.isFinite(score)) return null;
  const sorted = [...bands].sort((a, b) => b.min_score - a.min_score);
  return sorted.find((b) => score >= b.min_score) ?? sorted[sorted.length - 1] ?? null;
}
