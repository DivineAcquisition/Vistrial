import type { Tone } from "@/components/ui/tone";

export const BILLING_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "good" },
  trialing: { label: "Trial", tone: "brand" },
  past_due: { label: "Payment due", tone: "warning" },
  unpaid: { label: "Payment due", tone: "warning" },
  incomplete: { label: "Waiting for first payment", tone: "warning" },
  incomplete_expired: { label: "Not started", tone: "neutral" },
  paused: { label: "Paused", tone: "neutral" },
  canceled: { label: "Cancelled", tone: "neutral" },
};

const INTERVAL_WORDS: Record<string, [string, string]> = {
  day: ["day", "days"],
  week: ["week", "weeks"],
  month: ["month", "months"],
  year: ["year", "years"],
};

/** Stripe amounts are in the smallest unit; every currency Vistrial bills in has two decimals. */
export function formatPlanPrice(
  cents: number,
  currency: string,
  interval: string | null,
  count: number | null
): string {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
  if (!interval) return amount;
  const words = INTERVAL_WORDS[interval] ?? [interval, `${interval}s`];
  return count && count > 1 ? `${amount} every ${count} ${words[1]}` : `${amount} a ${words[0]}`;
}

/** Product metadata keys like limit_seats become "seats". */
export function limitLabel(key: string): string {
  return key.replace(/_/g, " ");
}

export type PaymentProblem = { since: string };
