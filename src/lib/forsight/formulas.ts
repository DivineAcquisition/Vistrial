import { toMetricValue, unavailable, type MetricValue } from "@/lib/forsight/values";

/**
 * Every cost and ratio Forsight reports, written once.
 *
 * Pages compute no metrics. A source adapter's contract is to hand back
 * figures that are already computed, and it satisfies that by running these,
 * so each one arrives at the page as one of the four metric states:
 *
 *   Cost per Audit Held
 *     held > 0 ? spend / held : spend > 0 ? "No audits yet" : absent
 *   CAC
 *     closed > 0 ? spend / closed : spend > 0 ? "No closes yet" : absent
 *   Cost per Booked Call / Application / Qualified Lead / Lead
 *     n > 0 ? spend / n : absent
 *   ROAS
 *     spend > 0 ? revenue / spend : absent
 *   CTR %
 *     impressions > 0 ? clicks / impressions * 100 : absent
 *
 * Note what the absent branch means. It is not zero and not null, and the
 * text branches are not absent either — "No closes yet" is a true statement
 * about a young funnel and says something a dash does not.
 */

/** Two decimal places, the precision every figure on these pages is shown at. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * `spend / count`, with its zero-denominator branch. `zeroText` is the
 * wording for a denominator of zero when there was spend to divide; omit it
 * for the figures that just come back absent.
 */
export function costPer(
  spend: MetricValue,
  count: MetricValue,
  zeroText?: string
): MetricValue {
  if (spend.kind === "unavailable") return spend;
  if (count.kind === "unavailable") return count;
  if (spend.kind !== "number" || count.kind !== "number") return toMetricValue("");

  if (count.value > 0) return toMetricValue(round2(spend.value / count.value));
  if (zeroText && spend.value > 0) return toMetricValue(zeroText);
  return toMetricValue("");
}

export const NO_AUDITS_YET = "No audits yet";
export const NO_CLOSES_YET = "No closes yet";

export function costPerAuditHeld(spend: MetricValue, held: MetricValue): MetricValue {
  return costPer(spend, held, NO_AUDITS_YET);
}

export function cac(spend: MetricValue, closed: MetricValue): MetricValue {
  return costPer(spend, closed, NO_CLOSES_YET);
}

export function costPerBookedCall(spend: MetricValue, booked: MetricValue): MetricValue {
  return costPer(spend, booked);
}

export function costPerApplication(spend: MetricValue, applications: MetricValue): MetricValue {
  return costPer(spend, applications);
}

export function costPerQualifiedLead(spend: MetricValue, qualified: MetricValue): MetricValue {
  return costPer(spend, qualified);
}

export function costPerLead(spend: MetricValue, leads: MetricValue): MetricValue {
  return costPer(spend, leads);
}

/** Revenue over spend. Blank when nothing was spent — not infinity. */
export function roas(revenue: MetricValue, spend: MetricValue): MetricValue {
  if (spend.kind === "unavailable") return spend;
  if (revenue.kind === "unavailable") return revenue;
  if (spend.kind !== "number" || revenue.kind !== "number") return toMetricValue("");
  if (spend.value <= 0) return toMetricValue("");
  return toMetricValue(round2(revenue.value / spend.value));
}

export function ctrPercent(clicks: MetricValue, impressions: MetricValue): MetricValue {
  if (clicks.kind !== "number" || impressions.kind !== "number") return toMetricValue("");
  if (impressions.value <= 0) return toMetricValue("");
  return toMetricValue(round2((clicks.value / impressions.value) * 100));
}

/**
 * Ad spend has no home in Vistrial's core schema, so a core-source workspace
 * without a Meta source cannot know what anything cost. Every metric that
 * divides by spend inherits this rather than quietly reading zero.
 */
export const NO_AD_SPEND = "No ad spend connected";

export function spendUnavailable(): MetricValue {
  return unavailable(NO_AD_SPEND);
}
