/** Rates (percent or per-hundred) require this many observations. */
export const REPORTING_RATE_MIN_N = 30;

/** Diagnostic findings require this many observations. */
export const REPORTING_DIAG_MIN_N = 20;

export const REPORTING_PANELS = [
  "meta",
  "outcome",
  "coverage",
  "throughput",
  "team",
  "follow_up",
  "objections",
  "sources",
  "terminal",
  "speed",
  "ingestion",
  "contribution",
  "readiness",
] as const;

export type ReportingPanel = (typeof REPORTING_PANELS)[number];

export const CLIENT_PANELS: ReportingPanel[] = [
  "meta",
  "outcome",
  "coverage",
  "throughput",
  "follow_up",
  "objections",
  "sources",
  "terminal",
  "speed",
  "ingestion",
  "contribution",
  "readiness",
];

export const RANGE_PRESETS = [
  { key: "since_activation", label: "Since activation" },
  { key: "last_30d", label: "Last 30 days" },
  { key: "last_90d", label: "Last 90 days" },
  { key: "custom", label: "Custom range" },
] as const;

export type ReportingRangeKey = (typeof RANGE_PRESETS)[number]["key"];

export const ATTRIBUTION_LINE =
  "Vistrial did not close these deals. The client's team did.";

export const CORRELATION_LINE =
  "A change after activation is not proof that Vistrial caused it. Other changes the client made may be in the same window.";
