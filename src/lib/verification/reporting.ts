import { fault, uniqueFaults } from "@/lib/verification/faults";
import type { DeterministicCheckResult, VerificationFault } from "@/lib/verification/types";

export type HeadlineRate = {
  k: number;
  n: number;
  perHundred: number | null;
  pct: number | null;
  tooSmall: boolean;
};

export type IntegritySnapshot = {
  closedWonWithoutRevenue: number;
  phantomTouches: number;
  scoreDrift: number;
};

function ratesEqual(a: HeadlineRate, b: HeadlineRate): boolean {
  return (
    a.k === b.k &&
    a.n === b.n &&
    a.tooSmall === b.tooSmall &&
    a.perHundred === b.perHundred &&
    a.pct === b.pct
  );
}

function rateConsistent(rate: HeadlineRate): VerificationFault[] {
  const faults: VerificationFault[] = [];
  if (rate.k < 0 || rate.n < 0) {
    faults.push(fault("arithmetic", "rate", "Counts cannot be negative."));
  }
  if (rate.k > rate.n) {
    faults.push(fault("arithmetic", "rate", `k (${rate.k}) exceeds n (${rate.n}).`));
  }
  if (rate.pct !== null && (rate.pct < 0 || rate.pct > 100)) {
    faults.push(fault("arithmetic", "pct", `Percentage ${rate.pct} is outside 0–100.`));
  }
  if (rate.perHundred !== null && rate.perHundred < 0) {
    faults.push(fault("arithmetic", "per_hundred", "Per-hundred cannot be negative."));
  }
  if (!rate.tooSmall && rate.n > 0 && rate.perHundred !== null) {
    const expected = Math.trunc((rate.k * 1000) / rate.n) / 10;
    if (Math.abs(expected - rate.perHundred) > 0.15) {
      faults.push(
        fault(
          "arithmetic",
          "per_hundred",
          `Per-hundred ${rate.perHundred} does not match ${rate.k}/${rate.n}.`
        )
      );
    }
  }
  return faults;
}

/**
 * Reporting verification is code only. A mismatch blocks display.
 * Never call a model from here.
 */
export function checkReportingHeadlines(args: {
  displayed: HeadlineRate | null;
  recomputed: HeadlineRate | null;
  integrity: IntegritySnapshot;
}): DeterministicCheckResult {
  const faults: VerificationFault[] = [];
  if (args.displayed && args.recomputed && !ratesEqual(args.displayed, args.recomputed)) {
    faults.push(
      fault(
        "headline_mismatch",
        "outcome",
        `Displayed ${args.displayed.k}/${args.displayed.n} does not match independent recompute ${args.recomputed.k}/${args.recomputed.n}.`
      )
    );
  }
  if (args.displayed) faults.push(...rateConsistent(args.displayed));
  if (args.recomputed) faults.push(...rateConsistent(args.recomputed));
  if (args.integrity.closedWonWithoutRevenue > 0) {
    faults.push(
      fault(
        "integrity",
        "closed_won",
        `${args.integrity.closedWonWithoutRevenue} closed-won lead(s) have no revenue row.`
      )
    );
  }
  if (args.integrity.phantomTouches > 0) {
    faults.push(
      fault("integrity", "touches", `${args.integrity.phantomTouches} touch(es) are dated in the future.`)
    );
  }
  if (args.integrity.scoreDrift > 0) {
    faults.push(
      fault(
        "integrity",
        "current_score",
        `${args.integrity.scoreDrift} lead(s) have a cached score that does not match the latest score row.`
      )
    );
  }
  return { ok: uniqueFaults(faults).length === 0, faults: uniqueFaults(faults) };
}

function asCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

export function parseHeadlineRate(value: unknown): HeadlineRate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const k = asCount(row.k);
  const n = asCount(row.n);
  if (k === null || n === null) return null;
  return {
    k,
    n,
    perHundred: asCount(row.per_hundred),
    pct: asCount(row.pct),
    tooSmall: row.too_small === true,
  };
}

export function collectPayloadRateFaults(value: unknown, path = "payload"): VerificationFault[] {
  const faults: VerificationFault[] = [];
  if (!value || typeof value !== "object") return faults;
  if (Array.isArray(value)) {
    value.forEach((item, index) => faults.push(...collectPayloadRateFaults(item, `${path}[${index}]`)));
    return faults;
  }
  const row = value as Record<string, unknown>;
  const looksLikeRate =
    "k" in row && "n" in row && ("too_small" in row || "per_hundred" in row || "pct" in row);
  if (looksLikeRate) {
    const rate = parseHeadlineRate(value);
    if (rate) faults.push(...rateConsistent(rate));
  }
  for (const [key, child] of Object.entries(row)) {
    if (child && typeof child === "object") {
      faults.push(...collectPayloadRateFaults(child, `${path}.${key}`));
    }
  }
  return uniqueFaults(faults);
}
