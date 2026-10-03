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

export type WeeklyPulse = {
  weeks: WeekRow[];
  current: WeekRow | null;
  previous: WeekRow | null;
  /** Trends need two points. One week is a number, not a direction. */
  hasTrend: boolean;
};
