import { CALIBRATION_BANDS, type CalibrationBandKey } from "@/lib/calibration/constants";
import { SCORE_FACTORS, type FactorValues, type ScoreWeights } from "@/lib/scoring/compute";
import { computeReadinessScore } from "@/lib/scoring/compute";

export function scoreBandKey(score: number | null | undefined): CalibrationBandKey | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  if (score < 20) return "0-19";
  if (score < 40) return "20-39";
  if (score < 60) return "40-59";
  if (score < 80) return "60-79";
  return "80-100";
}

export function bandLabel(key: string): string {
  const found = CALIBRATION_BANDS.find((band) => band.key === key);
  return found?.label ?? key;
}

export type BandRate = {
  key: string;
  n: number;
  closed: number;
  closeRate: number | null;
  tooSmall: boolean;
};

export type CurveBreak =
  | { kind: "reversal"; fromKey: string; toKey: string; fromRate: number; toRate: number }
  | { kind: "flat"; fromKey: string; toKey: string; rate: number };

/** Shown bands only, in score order. A dip is a reversal; equal rates are flat. */
export function curveBreaks(bands: BandRate[]): CurveBreak[] {
  const shown = bands.filter((band) => !band.tooSmall && band.closeRate !== null);
  const out: CurveBreak[] = [];
  for (let i = 1; i < shown.length; i += 1) {
    const prev = shown[i - 1];
    const next = shown[i];
    const fromRate = prev.closeRate as number;
    const toRate = next.closeRate as number;
    if (toRate < fromRate) {
      out.push({
        kind: "reversal",
        fromKey: prev.key,
        toKey: next.key,
        fromRate,
        toRate,
      });
    } else if (toRate === fromRate) {
      out.push({ kind: "flat", fromKey: prev.key, toKey: next.key, rate: toRate });
    }
  }
  return out;
}

export function isMonotonicIncreasing(bands: BandRate[]): boolean {
  const shown = bands.filter((band) => !band.tooSmall && band.closeRate !== null);
  if (shown.length < 2) return false;
  return curveBreaks(shown).length === 0;
}

export function steepestStep(bands: BandRate[]): {
  fromKey: string;
  toKey: string;
  jump: number;
  suggestedThreshold: number;
} | null {
  const shown = bands.filter((band) => !band.tooSmall && band.closeRate !== null);
  if (shown.length < 2) return null;
  let best: { fromKey: string; toKey: string; jump: number; suggestedThreshold: number } | null =
    null;
  for (let i = 1; i < shown.length; i += 1) {
    const jump = (shown[i].closeRate as number) - (shown[i - 1].closeRate as number);
    const to = CALIBRATION_BANDS.find((band) => band.key === shown[i].key);
    if (!to) continue;
    if (!best || jump > best.jump) {
      best = {
        fromKey: shown[i - 1].key,
        toKey: shown[i].key,
        jump,
        suggestedThreshold: to.lo,
      };
    }
  }
  return best;
}

export function recomputeTotal(factors: FactorValues, weights: ScoreWeights): number | null {
  const result = computeReadinessScore(factors, weights);
  return result.kind === "scored" ? result.total : null;
}

export function causationCopy(text: string): boolean {
  return (
    /vistrial (closed|caused|produced)/i.test(text) ||
    /score (caused|produced|made them close)/i.test(text) ||
    /because (we|the product|vistrial) (scored|called)/i.test(text)
  );
}

export { SCORE_FACTORS };
