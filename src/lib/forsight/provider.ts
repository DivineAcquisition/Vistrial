import "server-only";

import { listAirtableRecords } from "@/lib/forsight/airtable";
import { creativesByCostPerAuditHeld, type CreativeRow } from "@/lib/forsight/creatives";
import { ForsightSourceError } from "@/lib/forsight/errors";
import { pipelineHealth, type PipelineHealth } from "@/lib/forsight/pipeline";
import {
  availableDatasets,
  loadForsightSource,
  loadForsightSources,
  type ForsightDb,
} from "@/lib/forsight/sources";
import {
  FORSIGHT_DATASET_LABELS,
  type ForsightAirtableSource,
  type ForsightDataset,
  type ForsightMetricsProvider,
  type ForsightRecord,
  type ForsightResult,
  type ForsightSourceType,
} from "@/lib/forsight/types";
import { weeklyPulse, type WeeklyPulse } from "@/lib/forsight/weekly";

/**
 * A workspace has a source, the source has a type, and the type decides how
 * Forsight reads it.
 *
 * The contract is deliberately in the product's own vocabulary — weeks,
 * creatives, pipeline health — and not in any source's. An adapter's job is to
 * produce those shapes with the metrics already computed; how it gets there is
 * its own business. That is what lets a page ask for "this workspace's weekly
 * metrics" without ever learning where they came from, and it is why adding
 * the Vistrial-core type below touched no page.
 */

function unavailableDataset<T>(reason: string): ForsightResult<T> {
  return { available: false, reason };
}

export function airtableProvider(
  source: ForsightAirtableSource,
  orgLabel?: string | null,
  fetchImpl?: typeof fetch
): ForsightMetricsProvider {
  const read = async (dataset: ForsightDataset): Promise<ForsightResult<ForsightRecord[]>> => {
    const table = source.tables[dataset]?.trim();
    if (!table) {
      return unavailableDataset(
        `This workspace's base has no ${FORSIGHT_DATASET_LABELS[dataset]} table.`
      );
    }
    const records = await listAirtableRecords({
      orgId: source.orgId,
      orgLabel,
      baseId: source.baseId,
      table,
      fetchImpl,
    });
    return { available: true, data: records };
  };

  return {
    sourceType: "airtable",
    orgId: source.orgId,
    sourceId: source.id,
    availableDatasets: () => availableDatasets(source),

    // Airtable calculated all of these in formula fields. The mappers below
    // read those results; nothing here divides.
    async weeks() {
      const result = await read("weeklySummary");
      return result.available
        ? { available: true, data: weeklyPulse(result.data) }
        : result;
    },
    async creatives() {
      const result = await read("creatives");
      return result.available
        ? { available: true, data: creativesByCostPerAuditHeld(result.data) }
        : result;
    },
    async pipeline() {
      const result = await read("leads");
      return result.available ? { available: true, data: pipelineHealth(result.data) } : result;
    },
  };
}

/**
 * The one entry point for reading a workspace's metrics. Throws rather than
 * returning an empty provider when the workspace has no source, so a missing
 * configuration can never look like a workspace with no activity.
 */
export async function forsightProviderFor(
  db: ForsightDb,
  args: { orgId: string; orgName?: string | null }
): Promise<ForsightMetricsProvider> {
  const sources = await loadForsightSources(db, args.orgId);
  const metricsSource = sources.find(
    (source) => source.type === "airtable" || source.type === "vistrial_core"
  );

  if (!metricsSource) {
    throw new ForsightSourceError({
      orgId: args.orgId,
      orgLabel: args.orgName,
      sourceType: "airtable",
      reason: "not_configured",
      detail: "Add a Forsight source for this workspace before reading metrics.",
    });
  }

  if (metricsSource.type === "vistrial_core") {
    const { coreProvider } = await import("@/lib/forsight/core-source");
    return coreProvider(db, metricsSource, {
      orgName: args.orgName,
      meta: sources.find((source) => source.type === "meta_ads") ?? null,
    });
  }

  return airtableProvider(metricsSource, args.orgName);
}

/** Kept for the Meta sync, which needs the Airtable source specifically. */
export async function airtableSourceFor(db: ForsightDb, orgId: string) {
  return loadForsightSource(db, orgId, "airtable");
}

export type {
  CreativeRow,
  ForsightMetricsProvider,
  ForsightSourceType,
  PipelineHealth,
  WeeklyPulse,
};
