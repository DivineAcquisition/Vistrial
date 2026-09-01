import "server-only";

import { listAirtableRecords } from "@/lib/forsight/airtable";
import {
  createAirtableRecords,
  updateAirtableRecords,
  type AirtableUpdate,
} from "@/lib/forsight/airtable-write";
import { CREATIVE_FIELDS, WEEKLY_SUMMARY_FIELDS, readDate, readText } from "@/lib/forsight/fields";
import { ForsightSourceError } from "@/lib/forsight/errors";
import { fetchMetaAdInsights, type MetaAdInsight } from "@/lib/forsight/meta";
import { loadForsightSources, type ForsightDb } from "@/lib/forsight/sources";
import type { ForsightAirtableSource, ForsightMetaSource } from "@/lib/forsight/types";
import { isoDate, weekCadence, weekEnd, weekLabel, weekStartsBetween } from "@/lib/forsight/weeks";
import type { Json } from "@/types/database";

/**
 * Meta ad spend into Airtable. The only write in Forsight.
 *
 * ## Re-running is safe because nothing is ever accumulated
 *
 * Every value written is an absolute total for a fixed window, recomputed from
 * Meta and PATCHed as a set. There are no counters and no read-modify-add, so
 * running the same period twice writes the same numbers twice and the second
 * run changes nothing. Idempotency is a property of the shape of the write
 * rather than of bookkeeping that could itself go wrong.
 *
 * That leaves the sync log as a scheduling hint, not a correctness mechanism:
 * it says which weeks to recompute, and if it is wrong the worst case is
 * recomputing a week that was already right.
 *
 * ## Two windows, because the two destinations mean different things
 *
 * A Creatives row's cost formulas divide its Spend by lifetime rollups —
 * lifetime leads, lifetime audits held. So its Spend must be lifetime spend.
 * A Weekly Summary row's formulas divide by that week's counts, so its Total
 * Spend must be that week's spend. Writing a since-last-sync figure into
 * either one would silently corrupt every cost on the dashboard.
 *
 * ## What the sync must not touch
 *
 * Applications, qualified, booked, held, closed, revenue and notes are typed
 * by a person. The write allowlist below is the guarantee, and it is asserted
 * on every record before it leaves this module.
 */

/** Fields this sync is permitted to write. Anything else is a bug. */
export const CREATIVE_WRITABLE = new Set<string>([
  CREATIVE_FIELDS.spend,
  CREATIVE_FIELDS.impressions,
  CREATIVE_FIELDS.clicks,
]);

export const WEEKLY_SUMMARY_WRITABLE = new Set<string>([
  WEEKLY_SUMMARY_FIELDS.spend,
  // Only ever set when the sync creates a week row that did not exist.
  WEEKLY_SUMMARY_FIELDS.week,
  WEEKLY_SUMMARY_FIELDS.weekStart,
]);

/** Fields a person owns. Named explicitly so the test can assert on them. */
export const WEEKLY_SUMMARY_MANUAL = [
  WEEKLY_SUMMARY_FIELDS.applications,
  WEEKLY_SUMMARY_FIELDS.qualified,
  WEEKLY_SUMMARY_FIELDS.booked,
  WEEKLY_SUMMARY_FIELDS.held,
  WEEKLY_SUMMARY_FIELDS.closed,
  WEEKLY_SUMMARY_FIELDS.revenue,
  WEEKLY_SUMMARY_FIELDS.notes,
] as const;

/** A sync that has been down for months catches up on recent weeks, not all of them. */
export const MAX_CATCHUP_WEEKS = 6;

export function assertWritable(
  fields: Record<string, unknown>,
  allowed: Set<string>,
  where: string
): void {
  for (const key of Object.keys(fields)) {
    if (!allowed.has(key)) {
      throw new Error(`Forsight tried to write "${key}" in ${where}, which it does not own.`);
    }
  }
}

export type MetaSyncOutcome = {
  orgId: string;
  periodStart: string;
  periodEnd: string;
  creativesWritten: number;
  weeksWritten: number;
  spendWritten: number;
  unmatchedAds: string[];
};

type SyncDeps = {
  now?: Date;
  fetchImpl?: typeof fetch;
};

export async function runForsightMetaSync(
  db: ForsightDb,
  deps: SyncDeps = {}
): Promise<{ runs: MetaSyncOutcome[]; failures: Array<{ orgId: string; error: string }> }> {
  const { data } = await db
    .from("forsight_sources")
    .select("org_id")
    .eq("source_type", "meta_ads")
    .eq("status", "active");

  const orgIds = [...new Set((data ?? []).map((row) => row.org_id))];
  const runs: MetaSyncOutcome[] = [];
  const failures: Array<{ orgId: string; error: string }> = [];

  // One workspace's broken base must not stop the next workspace's sync.
  for (const orgId of orgIds) {
    try {
      runs.push(await syncWorkspaceSpend(db, orgId, deps));
    } catch (error) {
      failures.push({
        orgId,
        error: error instanceof Error ? error.message : "Meta spend sync failed.",
      });
    }
  }

  return { runs, failures };
}

export async function syncWorkspaceSpend(
  db: ForsightDb,
  orgId: string,
  deps: SyncDeps = {}
): Promise<MetaSyncOutcome> {
  const now = deps.now ?? new Date();
  const today = isoDate(now);

  const { orgName, airtable, meta } = await sourcesFor(db, orgId);

  const { data: run } = await db
    .from("forsight_sync_runs")
    .insert({ org_id: orgId, source_type: "meta_ads", status: "running" })
    .select("id")
    .single();
  const runId = run?.id ?? null;

  try {
    const outcome = await performSync({ db, orgId, orgName, airtable, meta, today, deps });
    if (runId) {
      await db
        .from("forsight_sync_runs")
        .update({
          status: "succeeded",
          period_start: outcome.periodStart,
          period_end: outcome.periodEnd,
          creatives_written: outcome.creativesWritten,
          weeks_written: outcome.weeksWritten,
          spend_written: outcome.spendWritten,
          unmatched_ads: outcome.unmatchedAds as unknown as Json,
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }
    return outcome;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meta spend sync failed.";
    if (runId) {
      // The period is deliberately not recorded as done. The next run redoes
      // it, and because every write is absolute, redoing it is free.
      await db
        .from("forsight_sync_runs")
        .update({ status: "failed", error: message, finished_at: new Date().toISOString() })
        .eq("id", runId);
    }
    throw error;
  }
}

async function sourcesFor(db: ForsightDb, orgId: string) {
  const { data: org } = await db.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const orgName = org?.name ?? null;
  const sources = await loadForsightSources(db, orgId);

  const airtable = sources.find(
    (source): source is ForsightAirtableSource => source.type === "airtable"
  );
  const meta = sources.find((source): source is ForsightMetaSource => source.type === "meta_ads");

  if (!meta) {
    throw new ForsightSourceError({
      orgId,
      orgLabel: orgName,
      sourceType: "meta_ads",
      reason: "not_configured",
      detail: "This workspace has no Meta ad account on file.",
    });
  }
  if (!airtable) {
    throw new ForsightSourceError({
      orgId,
      orgLabel: orgName,
      sourceType: "airtable",
      reason: "not_configured",
      detail: "Meta spend has nowhere to land: this workspace has no Airtable base on file.",
    });
  }
  if (!airtable.tables.creatives || !airtable.tables.weeklySummary) {
    throw new ForsightSourceError({
      orgId,
      orgLabel: orgName,
      sourceType: "airtable",
      reason: "not_configured",
      detail: "The spend sync needs both a Creatives and a Weekly Summary table on this base.",
    });
  }

  return { orgName, airtable, meta };
}

async function performSync(args: {
  db: ForsightDb;
  orgId: string;
  orgName: string | null;
  airtable: ForsightAirtableSource;
  meta: ForsightMetaSource;
  today: string;
  deps: SyncDeps;
}): Promise<MetaSyncOutcome> {
  const { db, orgId, orgName, airtable, meta, today, deps } = args;
  const creativesTable = airtable.tables.creatives as string;
  const weeklyTable = airtable.tables.weeklySummary as string;
  const read = {
    orgId,
    orgLabel: orgName,
    baseId: airtable.baseId,
    fetchImpl: deps.fetchImpl,
  };

  const [creativeRecords, weeklyRecords] = await Promise.all([
    listAirtableRecords({ ...read, table: creativesTable }),
    listAirtableRecords({ ...read, table: weeklyTable }),
  ]);

  // --- Creatives: lifetime totals, matched by exact name ------------------
  const lifetime = await fetchMetaAdInsights({
    orgId,
    orgLabel: orgName,
    adAccountId: meta.adAccountId,
    since: today,
    until: today,
    datePreset: "maximum",
    fetchImpl: deps.fetchImpl,
  });

  const byName = new Map<string, string>();
  for (const record of creativeRecords) {
    const name = readText(record, CREATIVE_FIELDS.name);
    if (name) byName.set(name, record.id);
  }

  const totals = totalsByAdName(lifetime.rows);
  const updates: AirtableUpdate[] = [];
  const unmatchedAds: string[] = [];

  for (const [adName, total] of totals) {
    const recordId = byName.get(adName);
    if (!recordId) {
      // Our Meta ad names are kept identical to the Airtable creative names on
      // purpose; that convention is the only join between the two systems. A
      // miss is a naming mistake somebody needs to fix, so it is reported and
      // never guessed at.
      unmatchedAds.push(adName);
      continue;
    }
    const fields = {
      [CREATIVE_FIELDS.spend]: round2(total.spend),
      [CREATIVE_FIELDS.impressions]: Math.round(total.impressions),
      [CREATIVE_FIELDS.clicks]: Math.round(total.clicks),
    };
    assertWritable(fields, CREATIVE_WRITABLE, creativesTable);
    updates.push({ id: recordId, fields });
  }

  await updateAirtableRecords({ ...read, table: creativesTable, fetchImpl: deps.fetchImpl }, updates);

  // --- Weekly Summary: this period's weeks, each an absolute total --------
  const cadence = weekCadence(
    weeklyRecords
      .map((record) => readDate(record, WEEKLY_SUMMARY_FIELDS.weekStart))
      .filter((date): date is string => Boolean(date)),
    today
  );

  const from = await lastSyncedThrough(db, orgId);
  const weekStarts = weekStartsBetween(cadence, from ?? today, today, MAX_CATCHUP_WEEKS);

  const weeklyByStart = new Map<string, string>();
  for (const record of weeklyRecords) {
    const start = readDate(record, WEEKLY_SUMMARY_FIELDS.weekStart);
    if (start) weeklyByStart.set(start, record.id);
  }

  let spendWritten = 0;
  const weeklyUpdates: AirtableUpdate[] = [];
  const weeklyCreates: Array<{ fields: Record<string, unknown> }> = [];

  for (const weekStart of weekStarts) {
    const insights = await fetchMetaAdInsights({
      orgId,
      orgLabel: orgName,
      adAccountId: meta.adAccountId,
      since: weekStart,
      until: weekEnd(weekStart),
      fetchImpl: deps.fetchImpl,
    });

    const spend = round2(insights.totalSpend);
    spendWritten += spend;

    const existing = weeklyByStart.get(weekStart);
    if (existing) {
      // Spend and nothing else. Everything a person typed stays untouched
      // because a PATCH only sets the fields it names.
      const fields = { [WEEKLY_SUMMARY_FIELDS.spend]: spend };
      assertWritable(fields, WEEKLY_SUMMARY_WRITABLE, weeklyTable);
      weeklyUpdates.push({ id: existing, fields });
    } else {
      const fields = {
        [WEEKLY_SUMMARY_FIELDS.week]: weekLabel(weekStart),
        [WEEKLY_SUMMARY_FIELDS.weekStart]: weekStart,
        [WEEKLY_SUMMARY_FIELDS.spend]: spend,
      };
      assertWritable(fields, WEEKLY_SUMMARY_WRITABLE, weeklyTable);
      weeklyCreates.push({ fields });
    }
  }

  await updateAirtableRecords(
    { ...read, table: weeklyTable, fetchImpl: deps.fetchImpl },
    weeklyUpdates
  );
  await createAirtableRecords(
    { ...read, table: weeklyTable, fetchImpl: deps.fetchImpl },
    weeklyCreates
  );

  return {
    orgId,
    periodStart: weekStarts[0] ?? today,
    periodEnd: today,
    creativesWritten: updates.length,
    weeksWritten: weeklyUpdates.length + weeklyCreates.length,
    spendWritten: round2(spendWritten),
    unmatchedAds,
  };
}

/**
 * Meta returns one row per ad per day when `time_increment` splits them, so ads
 * are folded together by name before anything is written.
 */
export function totalsByAdName(
  rows: MetaAdInsight[]
): Map<string, { spend: number; impressions: number; clicks: number }> {
  const totals = new Map<string, { spend: number; impressions: number; clicks: number }>();
  for (const row of rows) {
    const name = row.adName?.trim();
    if (!name) continue;
    const running = totals.get(name) ?? { spend: 0, impressions: 0, clicks: 0 };
    running.spend += row.spend;
    running.impressions += row.impressions;
    running.clicks += row.clicks;
    totals.set(name, running);
  }
  return totals;
}

/** Only a clean run moves the mark forward. */
async function lastSyncedThrough(db: ForsightDb, orgId: string): Promise<string | null> {
  const { data } = await db
    .from("forsight_sync_runs")
    .select("period_end")
    .eq("org_id", orgId)
    .eq("source_type", "meta_ads")
    .eq("status", "succeeded")
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.period_end ?? null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
