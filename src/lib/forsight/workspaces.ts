import "server-only";

import { coreProvider } from "@/lib/forsight/core-source";
import { airtableProvider } from "@/lib/forsight/provider";
import { loadForsightSources } from "@/lib/forsight/sources";
import { requireForsightOperator } from "@/lib/forsight/operator";
import { createClient } from "@/lib/supabase/server";
import type { ForsightSourceType } from "@/lib/forsight/types";
import { ABSENT, type MetricValue } from "@/lib/forsight/values";

/**
 * Every workspace's headline numbers on one screen.
 *
 * This is the one place in Forsight that shows one tenant's metrics beside
 * another's, which is exactly the boundary the rest of the architecture exists
 * to enforce. It is legitimate because Divine Acquisition runs these systems on
 * clients' behalf, and it is gated where it cannot be bypassed: the read runs
 * through the operator's own Supabase client, so `user_org_ids()` decides what
 * comes back. For a platform admin that is every workspace. For anyone else it
 * would be their own — and `requireForsightOperator` has already refused them,
 * so the page does not exist rather than showing a list of one.
 */

export type WorkspaceOverviewRow = {
  orgId: string;
  name: string;
  slug: string;
  sourceType: ForsightSourceType | null;
  costPerAuditHeld: MetricValue;
  cac: MetricValue;
  neverContacted: number | null;
  goingQuiet: number | null;
  debriefsMissing: number | null;
  error: string | null;
};

export async function loadWorkspaceOverview(): Promise<WorkspaceOverviewRow[] | null> {
  const ctx = await requireForsightOperator();
  if (!ctx) return null;

  const supabase = await createClient();
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .order("name", { ascending: true });

  const rows = await Promise.all(
    (orgs ?? []).map((org) => overviewRow(supabase, org))
  );
  return rows;
}

async function overviewRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  org: { id: string; name: string; slug: string }
): Promise<WorkspaceOverviewRow> {
  const base: WorkspaceOverviewRow = {
    orgId: org.id,
    name: org.name,
    slug: org.slug,
    sourceType: null,
    costPerAuditHeld: ABSENT,
    cac: ABSENT,
    neverContacted: null,
    goingQuiet: null,
    debriefsMissing: null,
    error: null,
  };

  try {
    const sources = await loadForsightSources(supabase, org.id);
    const metrics = sources.find(
      (source) => source.type === "airtable" || source.type === "vistrial_core"
    );
    if (!metrics) return base;

    const provider =
      metrics.type === "vistrial_core"
        ? coreProvider(supabase, metrics, {
            orgName: org.name,
            meta: sources.find((source) => source.type === "meta_ads") ?? null,
          })
        : airtableProvider(metrics, org.name);

    // One workspace's broken base must not blank the whole table, so each row
    // carries its own failure.
    const [weeks, pipeline] = await Promise.all([
      provider.weeks().catch((error: unknown) => ({
        available: false as const,
        reason: error instanceof Error ? error.message : "Could not read this workspace.",
      })),
      provider.pipeline().catch((error: unknown) => ({
        available: false as const,
        reason: error instanceof Error ? error.message : "Could not read this workspace.",
      })),
    ]);

    const row = { ...base, sourceType: provider.sourceType };

    if (weeks.available) {
      const current = weeks.data.current;
      row.costPerAuditHeld = current?.costPerAuditHeld ?? ABSENT;
      row.cac = current?.cac ?? ABSENT;
    } else {
      row.error = weeks.reason;
    }

    if (pipeline.available) {
      row.neverContacted = pipeline.data.neverContacted.length;
      row.goingQuiet =
        pipeline.data.goingQuiet.ghosted14.length + pipeline.data.goingQuiet.ghosted30.length;
      row.debriefsMissing = pipeline.data.debriefsMissing.length;
    } else if (!row.error) {
      row.error = pipeline.reason;
    }

    return row;
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : "Could not read this workspace.",
    };
  }
}
