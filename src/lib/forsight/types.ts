import type { Enums } from "@/types/database";

/**
 * Forsight reads this workspace's own tables and the ad accounts attached to
 * it. These are the shapes a source presents, so another one could slot in
 * behind the same interface without a page learning about it.
 */

export type ForsightSourceType = Enums<"forsight_source_type">;

export type ForsightSourceStatus = Enums<"ghl_connection_status">;

/** The datasets a workspace's acquisition install is built from. */
export const FORSIGHT_DATASETS = ["leads", "creatives", "weeklySummary", "touches"] as const;

export type ForsightDataset = (typeof FORSIGHT_DATASETS)[number];

export const FORSIGHT_DATASET_LABELS: Record<ForsightDataset, string> = {
  leads: "Leads",
  creatives: "Creatives",
  weeklySummary: "Weekly Summary",
  touches: "Touches",
};

export type ForsightMetaSource = {
  id: string;
  orgId: string;
  type: "meta_ads";
  status: ForsightSourceStatus;
  label: string | null;
  adAccountId: string;
  lastVerifiedAt: string | null;
  lastError: string | null;
};

/**
 * GoHighLevel. Carries no credential: authentication comes from the
 * per-sub-account OAuth connection Vistrial's core already holds. All this
 * record adds is which calendar to read, because the core integration lists
 * every calendar on a location and never persists a chosen one.
 */
export type ForsightGhlSource = {
  id: string;
  orgId: string;
  type: "ghl";
  status: ForsightSourceStatus;
  label: string | null;
  /** NULL reads every calendar on the location. */
  calendarId: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
};

/**
 * Vistrial's own core tables. Needs no configuration at all: the workspace is
 * the whole address, and the RLS that scopes every other table scopes this.
 */
export type ForsightCoreSource = {
  id: string;
  orgId: string;
  type: "vistrial_core";
  status: ForsightSourceStatus;
  label: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
};

/**
 * What Forsight uses when a workspace has no core source row. Every client
 * workspace is already the address; the row is optional.
 */
export function implicitCoreSource(orgId: string): ForsightCoreSource {
  return {
    id: `implicit-core:${orgId}`,
    orgId,
    type: "vistrial_core",
    status: "active",
    label: null,
    lastVerifiedAt: null,
    lastError: null,
  };
}

export type ForsightSource = ForsightMetaSource | ForsightGhlSource | ForsightCoreSource;

/** The one metrics source a workspace reads, or core if none was provisioned. */
export function metricsSourceFor(
  sources: ForsightSource[],
  orgId: string
): ForsightCoreSource {
  const metrics = sources.find((source) => source.type === "vistrial_core");
  if (metrics?.type === "vistrial_core") return metrics;
  return implicitCoreSource(orgId);
}

/** One opaque row held by the read cache, in the shape its producer chose. */
export type ForsightRecord = {
  id: string;
  fields: Record<string, unknown>;
};

export type ForsightResult<T> =
  | { available: true; data: T }
  | { available: false; reason: string };

/**
 * Every Forsight read goes through this, and it is written in the product's
 * vocabulary rather than any source's.
 *
 * An adapter returns weeks, creatives and pipeline health with their metrics
 * already computed. Vistrial core gets there by querying its own tables and
 * applying the formulas. A page asks for a workspace's weekly metrics and
 * never learns how they were produced, which is what lets the source behind
 * them change without touching a page.
 */
export type ForsightMetricsProvider = {
  readonly sourceType: ForsightSourceType;
  readonly orgId: string;
  /** Identifies the exact source record, so a cache entry cannot outlive it. */
  readonly sourceId: string;
  /** Datasets this workspace's source actually has. */
  availableDatasets(): ForsightDataset[];
  weeks(): Promise<ForsightResult<import("@/lib/forsight/weekly").WeeklyPulse>>;
  creatives(): Promise<ForsightResult<import("@/lib/forsight/creatives").CreativeRow[]>>;
  pipeline(): Promise<ForsightResult<import("@/lib/forsight/pipeline").PipelineHealth>>;
  /**
   * A calendar month's figures for the client report. Same contract as the
   * rest: whatever the source cannot produce comes back null with a reason,
   * and the generator decides what that means on the page.
   */
  monthly(
    period: { start: string; end: string }
  ): Promise<ForsightResult<import("@/lib/forsight/report/types").MonthlyMetrics>>;
};
