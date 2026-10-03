import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ForsightSourceError } from "@/lib/forsight/errors";
import {
  type ForsightCoreSource,
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

  if (row.source_type === "ghl") {
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

  const source: ForsightCoreSource = {
    id: row.id,
    orgId: row.org_id,
    type: "vistrial_core",
    status: row.status,
    label: row.label,
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
      sourceType: "vistrial_core",
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
