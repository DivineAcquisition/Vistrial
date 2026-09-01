import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { airtableConfigured, metaConfigured } from "@/lib/forsight/env";
import { ForsightSourceError } from "@/lib/forsight/errors";
import {
  FORSIGHT_DATASETS,
  type ForsightAirtableSource,
  type ForsightDataset,
  type ForsightMetaSource,
  type ForsightSource,
  type ForsightSourceSummary,
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

export function credentialConfiguredFor(sourceType: ForsightSourceType): boolean {
  return sourceType === "airtable" ? airtableConfigured() : metaConfigured();
}

/**
 * What the Forsight landing page needs: which workspace this is, and whether
 * it has somewhere to read metrics from.
 */
export function summarizeSource(args: {
  orgId: string;
  orgName: string;
  source: ForsightSource | null;
  credentialConfigured: boolean;
}): ForsightSourceSummary {
  const { orgId, orgName, source } = args;
  if (!source) {
    return {
      orgId,
      orgName,
      configured: false,
      sourceType: null,
      status: null,
      label: null,
      availableDatasets: [],
      missingDatasets: [...FORSIGHT_DATASETS],
      lastVerifiedAt: null,
      lastError: null,
      credentialConfigured: args.credentialConfigured,
    };
  }

  return {
    orgId,
    orgName,
    configured: true,
    sourceType: source.type,
    status: source.status,
    label: source.label,
    availableDatasets: availableDatasets(source),
    missingDatasets: missingDatasets(source),
    lastVerifiedAt: source.lastVerifiedAt,
    lastError: source.lastError,
    credentialConfigured: args.credentialConfigured,
  };
}
