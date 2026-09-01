import type { Enums } from "@/types/database";

/**
 * Forsight is a display layer. It never owns metric data and never calculates
 * anything its sources do not already calculate. These are the shapes every
 * source type presents, so a second type slots in behind the same interface.
 */

export type ForsightSourceType = Enums<"forsight_source_type">;

export type ForsightSourceStatus = Enums<"ghl_connection_status">;

/** The four datasets a workspace's acquisition install is built from. */
export const FORSIGHT_DATASETS = ["leads", "creatives", "weeklySummary", "touches"] as const;

export type ForsightDataset = (typeof FORSIGHT_DATASETS)[number];

export const FORSIGHT_DATASET_LABELS: Record<ForsightDataset, string> = {
  leads: "Leads",
  creatives: "Creatives",
  weeklySummary: "Weekly Summary",
  touches: "Touches",
};

/**
 * A dataset the workspace's base does not have. Recorded on the source record
 * rather than discovered at read time, so the display layer can say "we do not
 * track this here" instead of showing a broken panel.
 */
export type ForsightDatasetMap = Record<ForsightDataset, string | null>;

export type ForsightAirtableSource = {
  id: string;
  orgId: string;
  type: "airtable";
  status: ForsightSourceStatus;
  label: string | null;
  baseId: string;
  tables: ForsightDatasetMap;
  lastVerifiedAt: string | null;
  lastError: string | null;
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

export type ForsightSource =
  | ForsightAirtableSource
  | ForsightMetaSource
  | ForsightGhlSource
  | ForsightCoreSource;

/** One row from a source, kept in the source's own vocabulary. */
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
 * already computed. The Airtable adapter gets there by reading formula fields;
 * the Vistrial-core adapter gets there by querying core tables and applying
 * the same formulas. A page asks for a workspace's weekly metrics and cannot
 * tell which answered — that is the whole point of the interface, and the
 * reason adding the second type changed no page.
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
