import "server-only";

import { listAirtableRecords } from "@/lib/forsight/airtable";
import { ForsightSourceError } from "@/lib/forsight/errors";
import {
  availableDatasets,
  loadForsightSource,
  type ForsightDb,
} from "@/lib/forsight/sources";
import {
  FORSIGHT_DATASET_LABELS,
  type ForsightAirtableSource,
  type ForsightDataset,
  type ForsightDatasetResult,
  type ForsightMetricsProvider,
  type ForsightReadOptions,
} from "@/lib/forsight/types";

/**
 * A workspace has a source, the source has a type, and the type decides how
 * Forsight reads it. Airtable is the first type. A Vistrial-core type, for
 * clients whose activity is already logged in the main app, is the second and
 * lands here without touching a single caller.
 */

export function airtableProvider(
  source: ForsightAirtableSource,
  orgLabel?: string | null
): ForsightMetricsProvider {
  return {
    sourceType: "airtable",
    orgId: source.orgId,
    availableDatasets: () => availableDatasets(source),
    async readDataset(
      dataset: ForsightDataset,
      options: ForsightReadOptions = {}
    ): Promise<ForsightDatasetResult> {
      const table = source.tables[dataset]?.trim();
      if (!table) {
        return {
          dataset,
          available: false,
          reason: `This workspace's base has no ${FORSIGHT_DATASET_LABELS[dataset]} table.`,
        };
      }

      const records = await listAirtableRecords({
        orgId: source.orgId,
        orgLabel,
        baseId: source.baseId,
        table,
        filterByFormula: options.filterByFormula,
        maxRecords: options.maxRecords,
        signal: options.signal,
      });

      return { dataset, available: true, records };
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
  const source = await loadForsightSource(db, args.orgId, "airtable");

  if (!source) {
    throw new ForsightSourceError({
      orgId: args.orgId,
      orgLabel: args.orgName,
      sourceType: "airtable",
      reason: "not_configured",
      detail: "Add a forsight_sources row for this workspace before reading metrics.",
    });
  }

  if (source.type !== "airtable") {
    throw new ForsightSourceError({
      orgId: args.orgId,
      orgLabel: args.orgName,
      sourceType: source.type,
      reason: "not_configured",
      detail: `Forsight has no reader for source type ${source.type}.`,
    });
  }

  return airtableProvider(source, args.orgName);
}
