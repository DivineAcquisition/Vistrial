import "server-only";

import { coreProvider } from "@/lib/forsight/core-source";
import type { CreativeRow } from "@/lib/forsight/creatives";
import type { PipelineHealth } from "@/lib/forsight/pipeline";
import { loadForsightSources, type ForsightDb } from "@/lib/forsight/sources";
import { metricsSourceFor, type ForsightMetricsProvider, type ForsightSourceType } from "@/lib/forsight/types";
import type { WeeklyPulse } from "@/lib/forsight/weekly";
import { loadDisplaySettings } from "@/lib/config/display";

/**
 * The one entry point for reading a workspace's metrics.
 *
 * Every workspace is its own address: the leads, calls, touches and revenue
 * Forsight reports on are already in Vistrial's tables, behind the same
 * row-level security as the rest of the app. Opening Forsight therefore never
 * waits on anyone provisioning an outside system first, and a missing Meta
 * connection stays a named omission rather than an empty dashboard.
 *
 * The contract is deliberately in the product's own vocabulary — weeks,
 * creatives, pipeline health. That is what lets a page ask for "this
 * workspace's weekly metrics" without learning where they came from.
 */
export async function forsightProviderFor(
  db: ForsightDb,
  args: { orgId: string; orgName?: string | null }
): Promise<ForsightMetricsProvider> {
  const sources = await loadForsightSources(db, args.orgId);
  const metricsSource = metricsSourceFor(sources, args.orgId);

  return coreProvider(db, metricsSource, {
    orgName: args.orgName,
    settings: await loadDisplaySettings(db, args.orgId),
    meta: sources.find((source) => source.type === "meta_ads") ?? null,
  });
}

export type {
  CreativeRow,
  ForsightMetricsProvider,
  ForsightSourceType,
  PipelineHealth,
  WeeklyPulse,
};
