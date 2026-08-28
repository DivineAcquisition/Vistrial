import { REPORTING_RATE_MIN_N } from "@/lib/reporting/constants";

/**
 * Cost figures must never look cheaper than they are. Ceiling is the unflattering
 * direction. Success rates use truncation the other way.
 */
export function costCentsUnflattering(spendCents: number, count: number): number | null {
  if (!Number.isFinite(spendCents) || !Number.isFinite(count)) return null;
  if (count <= 0 || spendCents < 0) return null;
  return Math.ceil(spendCents / count);
}

export function costPerUnit(args: {
  spendCents: number;
  count: number;
  minN?: number;
}): { cents: number | null; tooSmall: boolean; n: number } {
  const minN = args.minN ?? REPORTING_RATE_MIN_N;
  const tooSmall = args.count < minN;
  return {
    cents: tooSmall ? null : costCentsUnflattering(args.spendCents, args.count),
    tooSmall,
    n: args.count,
  };
}

export function formatCostUsd(cents: number | null, tooSmall: boolean): string {
  if (tooSmall || cents === null) return "Sample too small";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function dollarsToCentsUnflattering(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined) return 0;
  const n = typeof amount === "number" ? amount : Number.parseFloat(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n * 100);
}

export function microsToCentsUnflattering(micros: number | null | undefined): number {
  if (micros === null || micros === undefined || !Number.isFinite(micros) || micros <= 0) return 0;
  return Math.ceil(micros / 10_000);
}
