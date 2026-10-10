import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { PeriodRange } from "@/lib/home/periods";
import { filtersToJson, type ResultsFilters } from "@/lib/metrics/range";

/**
 * Thin readers over the portal_* SQL functions. They run as the person, so
 * the database decides what they may see; a metric they may not see comes
 * back hidden, never as zero.
 */

export type Db = SupabaseClient;

export type Aggregate = {
  count: number;
  leads: number;
  sum: number | null;
  avg: number | null;
  median: number | null;
};

export type SummaryEntry = { hidden: true } | { hidden?: false; current: Aggregate; previous: Aggregate | null };

export type Summary = Record<string, SummaryEntry>;

export type BreakdownRow = {
  key: string;
  label: string;
  count: number;
  leads: number;
  sum: number | null;
  median: number | null;
};

export type BreakdownDimension = "source" | "person" | "stage" | "band" | "day" | "detail";

export type MetricLeadRow = {
  leadId: string;
  name: string;
  at: string | null;
  value: number | null;
  detail: string | null;
};

export type WorkspaceFacts = {
  earliest_lead_at: string | null;
  has_leads: boolean;
  has_response: boolean;
  has_case_files: boolean;
  has_bands: boolean;
  has_stage_changes: boolean;
  has_bookings: boolean;
  has_relay: boolean;
  has_alerts: boolean;
  has_objections: boolean;
  has_revenue: boolean;
  has_typed_revenue: boolean;
  can_see_money: boolean;
  can_see_people: boolean;
  can_export: boolean;
  can_approve: boolean;
  top_band: string | null;
  bands: Array<{ name: string; min_score: number }>;
  first_touch_minutes: number | null;
  sources: Array<{ key: string; label: string; count: number }>;
  people: Array<{ id: string; name: string; role: string; active: boolean }> | null;
  fields: Array<{ key: string; label: string; values: string[] }>;
};

export async function portalDb(): Promise<Db> {
  return (await createClient()) as unknown as Db;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function aggregate(value: unknown): Aggregate {
  const row = (value ?? {}) as Record<string, unknown>;
  return {
    count: num(row.count) ?? 0,
    leads: num(row.leads) ?? 0,
    sum: num(row.sum),
    avg: num(row.avg),
    median: num(row.median),
  };
}

export function isNotFound(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42501";
}

export async function loadFacts(orgId: string, db?: Db): Promise<WorkspaceFacts | null> {
  const client = db ?? (await portalDb());
  const { data, error } = await client.rpc("portal_workspace_facts", { p_org_id: orgId });
  if (error) {
    if (isNotFound(error)) return null;
    throw new Error(error.message);
  }
  return data as WorkspaceFacts;
}

export async function loadSummary(args: {
  orgId: string;
  metrics: string[];
  range: Pick<PeriodRange, "from" | "to">;
  previous?: Pick<PeriodRange, "from" | "to"> | null;
  filters?: ResultsFilters;
  db?: Db;
}): Promise<Summary> {
  const client = args.db ?? (await portalDb());
  const { data, error } = await client.rpc("portal_metric_summary", {
    p_org_id: args.orgId,
    p_metrics: [...new Set(args.metrics)],
    p_from: args.range.from,
    p_to: args.range.to,
    p_prev_from: args.previous?.from ?? null,
    p_prev_to: args.previous?.to ?? null,
    p_filters: filtersToJson(args.filters ?? {}),
  });
  if (error) {
    if (isNotFound(error)) return Object.fromEntries(args.metrics.map((metric) => [metric, { hidden: true as const }]));
    throw new Error(error.message);
  }
  const out: Summary = {};
  for (const [metric, raw] of Object.entries((data ?? {}) as Record<string, Record<string, unknown>>)) {
    out[metric] = raw.hidden
      ? { hidden: true }
      : { current: aggregate(raw.current), previous: raw.previous ? aggregate(raw.previous) : null };
  }
  return out;
}

export async function loadBreakdown(args: {
  orgId: string;
  metric: string;
  range: Pick<PeriodRange, "from" | "to">;
  dimension: BreakdownDimension;
  filters?: ResultsFilters;
  db?: Db;
}): Promise<BreakdownRow[] | null> {
  const client = args.db ?? (await portalDb());
  const { data, error } = await client.rpc("portal_metric_breakdown", {
    p_org_id: args.orgId,
    p_metric: args.metric,
    p_from: args.range.from,
    p_to: args.range.to,
    p_filters: filtersToJson(args.filters ?? {}),
    p_dimension: args.dimension,
  });
  if (error) {
    if (isNotFound(error)) return null;
    throw new Error(error.message);
  }
  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => ({
      key: String(row.key ?? ""),
      label: String(row.label ?? row.key ?? ""),
      count: num(row.count) ?? 0,
      leads: num(row.leads) ?? 0,
      sum: num(row.sum),
      median: num(row.median),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export const DRILL_PAGE = 100;

export async function loadMetricLeads(args: {
  orgId: string;
  metric: string;
  range: Pick<PeriodRange, "from" | "to">;
  filters?: ResultsFilters;
  limit?: number;
  offset?: number;
  db?: Db;
}): Promise<{ rows: MetricLeadRow[]; total: number } | null> {
  const client = args.db ?? (await portalDb());
  const { data, error } = await client.rpc("portal_metric_leads", {
    p_org_id: args.orgId,
    p_metric: args.metric,
    p_from: args.range.from,
    p_to: args.range.to,
    p_filters: filtersToJson(args.filters ?? {}),
    p_limit: args.limit ?? DRILL_PAGE,
    p_offset: args.offset ?? 0,
  });
  if (error) {
    if (isNotFound(error)) return null;
    throw new Error(error.message);
  }
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return {
    total: rows.length ? (num(rows[0]?.total) ?? rows.length) : 0,
    rows: rows.map((row) => ({
      leadId: String(row.lead_id),
      name: String(row.name ?? "Unnamed lead"),
      at: typeof row.at === "string" ? row.at : null,
      value: num(row.value),
      detail: typeof row.detail === "string" ? row.detail : null,
    })),
  };
}

/** Whether the workspace has been recording for the whole comparison stretch. */
export function hasComparisonData(facts: Pick<WorkspaceFacts, "earliest_lead_at"> | null, previousFrom: string): boolean {
  return Boolean(facts?.earliest_lead_at && facts.earliest_lead_at <= previousFrom);
}
