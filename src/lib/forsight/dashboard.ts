import "server-only";

import { getAuthContext } from "@/lib/auth/session";
import { readCached } from "@/lib/forsight/cache";
import type { CreativeRow } from "@/lib/forsight/creatives";
import { ForsightSourceError } from "@/lib/forsight/errors";
import { forsightProviderFor } from "@/lib/forsight/provider";
import { loadGhlActivity, type GhlActivity } from "@/lib/forsight/ghl";
import type { PipelineHealth } from "@/lib/forsight/pipeline";
import { reconcileAppointments, type Reconciliation } from "@/lib/forsight/reconcile";
import { loadSpendToday, type SpendToday } from "@/lib/forsight/spend-today";
import { createClient } from "@/lib/supabase/server";
import {
  FORSIGHT_DATASET_LABELS,
  type ForsightDataset,
  type ForsightMetricsProvider,
  type ForsightResult,
} from "@/lib/forsight/types";
import { isoDate, weekEnd } from "@/lib/forsight/weeks";
import type { WeekRow, WeeklyPulse } from "@/lib/forsight/weekly";

/**
 * What a Forsight page gets handed. Every absence is its own state, because
 * "this client has not started yet", "this base does not track that", and
 * "we could not reach the base" need three different sentences on screen.
 */
export type ForsightView<T> =
  | { state: "ok"; workspace: Workspace; data: T; fetchedAt: Date }
  | { state: "empty"; workspace: Workspace; dataset: ForsightDataset; fetchedAt: Date }
  | { state: "unavailable"; workspace: Workspace; dataset: ForsightDataset; reason: string }
  | { state: "unconfigured"; workspace: Workspace }
  | { state: "error"; workspace: Workspace; message: string };

export type Workspace = { id: string; name: string; timezone: string };

/**
 * Reads one dataset from whichever adapter this workspace uses. Nothing here
 * knows or asks what type it is; the provider hands back finished shapes and
 * this only decides which absence to show.
 */
async function readVia<T>(
  dataset: ForsightDataset,
  read: (provider: ForsightMetricsProvider) => Promise<ForsightResult<T>>,
  isEmpty: (data: T) => boolean
): Promise<ForsightView<T>> {
  const ctx = await getAuthContext();
  const workspace: Workspace = {
    id: ctx.org.id,
    name: ctx.org.name,
    timezone: ctx.org.timezone,
  };

  try {
    const supabase = await createClient();
    const provider = await forsightProviderFor(supabase, {
      orgId: workspace.id,
      orgName: workspace.name,
    });

    let reason: string | null = null;
    let data: T | null = null;

    const cached = await readCached(
      { orgId: workspace.id, sourceId: provider.sourceId, dataset },
      async () => {
        const result = await read(provider);
        if (!result.available) {
          reason = result.reason;
          return [];
        }
        data = result.data;
        // The cache stores records; these adapters return finished shapes, so
        // the payload rides along as a single opaque row.
        return [{ id: dataset, fields: { data: result.data as unknown } }];
      }
    );

    if (reason) return { state: "unavailable", workspace, dataset, reason };

    const payload = (data ?? (cached.records[0]?.fields.data as T | undefined)) ?? null;
    if (payload === null) {
      return { state: "empty", workspace, dataset, fetchedAt: cached.fetchedAt };
    }
    if (isEmpty(payload)) {
      return { state: "empty", workspace, dataset, fetchedAt: cached.fetchedAt };
    }

    return { state: "ok", workspace, data: payload, fetchedAt: cached.fetchedAt };
  } catch (error) {
    if (error instanceof ForsightSourceError) {
      if (error.reason === "not_configured") {
        return { state: "unconfigured", workspace };
      }
      return { state: "error", workspace, message: error.message };
    }
    throw error;
  }
}

export async function loadWeeklyPulse(): Promise<ForsightView<WeeklyPulse>> {
  return readVia(
    "weeklySummary",
    (provider) => provider.weeks(),
    (pulse) => pulse.weeks.length === 0
  );
}

/**
 * The two live sources, loaded beside Weekly Pulse rather than inside it.
 * Neither can fail the page: each returns its own unavailable state, and the
 * Airtable-backed figures above them are unaffected either way.
 */
export async function loadLiveSources(
  current: WeekRow | null
): Promise<{ spendToday: SpendToday; comms: CommsView }> {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const now = new Date();

  const [spendToday, activity] = await Promise.all([
    loadSpendToday(supabase, { orgId: ctx.org.id, orgName: ctx.org.name, now }),
    loadWeekActivity(supabase, ctx.org.id, current, now),
  ]);

  return { spendToday, comms: activity };
}

export type CommsView =
  | { state: "ok"; activity: GhlActivity; reconciliation: Reconciliation }
  | { state: "not_tracked" }
  | { state: "unavailable"; reason: string };

async function loadWeekActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  current: WeekRow | null,
  now: Date
): Promise<CommsView> {
  // The window is the week Airtable itself is reporting on, so the two sides
  // of the comparison cover the same days.
  const from = current?.weekStart ?? isoDate(now);
  const to = isoDate(now) < weekEnd(from) ? isoDate(now) : weekEnd(from);

  const result = await loadGhlActivity(supabase, { orgId, from, to });
  if (result.state !== "ok") return result;

  return {
    state: "ok",
    activity: result.activity,
    reconciliation: reconcileAppointments(result.activity.appointments, {
      booked: current?.booked ?? { kind: "absent" },
      held: current?.held ?? { kind: "absent" },
    }),
  };
}

export async function loadCreativePerformance(): Promise<ForsightView<CreativeRow[]>> {
  return readVia(
    "creatives",
    (provider) => provider.creatives(),
    (rows) => rows.length === 0
  );
}

export async function loadPipelineHealth(): Promise<ForsightView<PipelineHealth>> {
  return readVia(
    "leads",
    (provider) => provider.pipeline(),
    (health) => health.totalLeads === 0
  );
}

/** What will show up here once data flows, said in the base's own vocabulary. */
export function datasetPromise(dataset: ForsightDataset): string {
  const label = FORSIGHT_DATASET_LABELS[dataset];
  switch (dataset) {
    case "weeklySummary":
      return `Spend, funnel counts, and the cost of each stage will appear here once the first ${label} row is filled in.`;
    case "creatives":
      return `Each ad creative and what it costs per audit held will appear here once the ${label} table has rows.`;
    case "leads":
      return `Leads needing a call, going quiet, or missing a debrief will appear here once the ${label} table has rows.`;
    default:
      return `This will fill in once the ${label} table has rows.`;
  }
}

/** Staleness should never be a mystery, so the time is the workspace's own. */
export function formatFetchedAt(fetchedAt: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
      timeZoneName: "short",
    }).format(fetchedAt);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    }).format(fetchedAt);
  }
}
