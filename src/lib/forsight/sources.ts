import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ForsightSourceError } from "@/lib/forsight/errors";
import {
  FORSIGHT_DATASETS,
  type ForsightAirtableSource,
  type ForsightDataset,
  type ForsightGhlSource,
  type ForsightMetaSource,
  type ForsightSource,
  type ForsightSourceType,
} from "@/lib/forsight/types";
import type { Database, Tables } from "@/types/database";

export type ForsightDb = SupabaseClient<Database>;

type ForsightSourceRow = Tables<"forsight_sources">;

/**
 * Rows come back through the caller's own Supabase client, so row-level
 * security decides what is visible. There is no admin-client escape hatch here:
 * a workspace's source is readable by that workspace's members and no one else.
 */
export function sourceFromRow(row: ForsightSourceRow): ForsightSource {
  if (row.source_type === "airtable") {
    const source: ForsightAirtableSource = {
      id: row.id,
      orgId: row.org_id,
      type: "airtable",
      status: row.status,
      label: row.label,
      baseId: row.airtable_base_id ?? "",
      tables: {
        leads: row.airtable_leads_table,
        creatives: row.airtable_creatives_table,
        weeklySummary: row.airtable_weekly_summary_table,
        touches: row.airtable_touches_table,
      },
      lastVerifiedAt: row.last_verified_at,
      lastError: row.last_error,
    };
    return source;
  }

  if (row.source_type === "meta_ads") {
    const source: ForsightMetaSource = {
      id: row.id,
      orgId: row.org_id,
      type: "meta_ads",
      status: row.status,
      label: row.label,
      adAccountId: row.meta_ad_account_id ?? "",
      lastVerifiedAt: row.last_verified_at,
      lastError: row.last_error,
    };
    return source;
  }

  const source: ForsightGhlSource = {
    id: row.id,
    orgId: row.org_id,
    type: "ghl",
    status: row.status,
    label: row.label,
    calendarId: row.ghl_calendar_id,
    lastVerifiedAt: row.last_verified_at,
    lastError: row.last_error,
  };
  return source;
}

export async function loadForsightSources(
  db: ForsightDb,
  orgId: string
): Promise<ForsightSource[]> {
  const { data, error } = await db
    .from("forsight_sources")
    .select("*")
    .eq("org_id", orgId)
    .order("source_type", { ascending: true });

  if (error) {
    throw new ForsightSourceError({
      orgId,
      sourceType: "airtable",
      reason: "unreachable",
      detail: `Reading the source record failed: ${error.message}`,
    });
  }

  return (data ?? []).map(sourceFromRow);
}

export async function loadForsightSource(
  db: ForsightDb,
  orgId: string,
  sourceType: ForsightSourceType
): Promise<ForsightSource | null> {
  const sources = await loadForsightSources(db, orgId);
  return sources.find((source) => source.type === sourceType) ?? null;
}

export function availableDatasets(source: ForsightSource): ForsightDataset[] {
  if (source.type !== "airtable") return [];
  return FORSIGHT_DATASETS.filter((dataset) => Boolean(source.tables[dataset]?.trim()));
}

export function missingDatasets(source: ForsightSource): ForsightDataset[] {
  if (source.type !== "airtable") return [...FORSIGHT_DATASETS];
  return FORSIGHT_DATASETS.filter((dataset) => !source.tables[dataset]?.trim());
}
