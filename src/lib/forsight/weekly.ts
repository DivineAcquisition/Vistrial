import { WEEKLY_SUMMARY_FIELDS as F, readDate, readMetric, readText } from "@/lib/forsight/fields";
import type { ForsightRecord } from "@/lib/forsight/types";
import type { MetricValue } from "@/lib/forsight/values";

export type WeekRow = {
  id: string;
  week: string;
  weekStart: string | null;
  spend: MetricValue;
  applications: MetricValue;
  qualified: MetricValue;
  booked: MetricValue;
  held: MetricValue;
  closed: MetricValue;
  revenue: MetricValue;
  costPerApplication: MetricValue;
  costPerBookedCall: MetricValue;
  costPerAuditHeld: MetricValue;
  cac: MetricValue;
  roas: MetricValue;
};

export function weekRow(record: ForsightRecord): WeekRow {
  return {
    id: record.id,
    week: readText(record, F.week) || "Unnamed week",
    weekStart: readDate(record, F.weekStart),
    spend: readMetric(record, F.spend),
    applications: readMetric(record, F.applications),
    qualified: readMetric(record, F.qualified),
    booked: readMetric(record, F.booked),
    held: readMetric(record, F.held),
    closed: readMetric(record, F.closed),
    revenue: readMetric(record, F.revenue),
    costPerApplication: readMetric(record, F.costPerApplication),
    costPerBookedCall: readMetric(record, F.costPerBookedCall),
    costPerAuditHeld: readMetric(record, F.costPerAuditHeld),
    cac: readMetric(record, F.cac),
    roas: readMetric(record, F.roas),
  };
}

/**
 * Oldest first, which is the order every trend on the page reads in. Weeks with
 * no start date keep their position from the base rather than being dropped —
 * a mis-entered week should be visible, not silently missing.
 */
export function weeksOldestFirst(records: ForsightRecord[]): WeekRow[] {
  return records
    .map((record, index) => ({ row: weekRow(record), index }))
    .sort((a, b) => {
      const left = a.row.weekStart;
      const right = b.row.weekStart;
      if (left && right && left !== right) return left < right ? -1 : 1;
      if (left && !right) return -1;
      if (!left && right) return 1;
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}

export type WeeklyPulse = {
  weeks: WeekRow[];
  current: WeekRow | null;
  previous: WeekRow | null;
  /** Trends need two points. One week is a number, not a direction. */
  hasTrend: boolean;
};

export function weeklyPulse(records: ForsightRecord[]): WeeklyPulse {
  const weeks = weeksOldestFirst(records);
  return {
    weeks,
    current: weeks[weeks.length - 1] ?? null,
    previous: weeks[weeks.length - 2] ?? null,
    hasTrend: weeks.length >= 2,
  };
}
