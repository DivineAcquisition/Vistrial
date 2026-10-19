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

const ASSAY_BANDS: Record<string, ScoringBand> = {
  hot: { name: "Hot", min_score: 75, meaning: "Most likely to buy right now. Work this lead first.", next_step: "Call today and book the next step." },
  warm: { name: "Warm", min_score: 50, meaning: "Interested and engaged. Keep it moving.", next_step: "Fill the gaps: timing, budget, and who decides." },
  cool: { name: "Cool", min_score: 25, meaning: "Some interest, not much going on yet.", next_step: "Keep in touch with useful, low-pressure follow-up." },
  cold: { name: "Cold", min_score: 0, meaning: "Little sign of buying right now.", next_step: "Check in lightly, or let it rest." },
};

/** The Assay tier as a band, for the case file's wording. The number and tier come from Assay. */
export function assayBandFor(tier: string | null): ScoringBand | null {
  return tier ? ASSAY_BANDS[tier] ?? null : null;
}
