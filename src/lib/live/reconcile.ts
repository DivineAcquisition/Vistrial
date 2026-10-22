import "server-only";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../convex/_generated/api";
import { notifyDaAlert } from "@/lib/ops/alerts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { compareRuns, liveRecordSink } from "@/lib/live/words";

const WINDOW_HOURS = 24;
const WORKSPACES_PER_PASS = 50;

type Loose = {
  from: (table: string) => {
    select: (columns: string) => {
      gte: (column: string, value: string) => {
        limit: (n: number) => Promise<{ data: Array<{ org_id: string }> | null; error: { message: string } | null }>;
      };
    };
    insert: (rows: object[]) => Promise<{ error: { message: string } | null }>;
  };
  rpc: (fn: string, args: object) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/**
 * Compares the Convex record with the Postgres copy for workspaces with
 * recent runs, and records the drift for staff. Counts and identifiers only.
 * Returns null when Convex is not the writer or cannot be reached.
 */
export async function reconcileLiveRecord(now = new Date()): Promise<{ workspaces: number; drifted: number } | null> {
  if (liveRecordSink() !== "convex") return null;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const key = process.env.CONVEX_SYSTEM_KEY;
  if (!url || !key) return null;
  const db = getSupabaseAdmin() as unknown as Loose;
  const since = new Date(now.getTime() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await db.from("agent_activity_runs").select("org_id").gte("created_at", since).limit(5000);
  if (error) return null;
  const orgIds = [...new Set((data ?? []).map((row) => row.org_id))].slice(0, WORKSPACES_PER_PASS);
  const client = new ConvexHttpClient(url);
  const rows: object[] = [];
  let drifted = 0;
  for (const orgId of orgIds) {
    let convex: Array<{ id: string; status: string }>;
    try {
      convex = (await client.query(api.live.runIdsSince, { key, job: "reconcile", workspaceId: orgId, since })) as Array<{
        id: string;
        status: string;
      }>;
    } catch {
      return null;
    }
    const pg = await db.rpc("live_record_run_ids", { p_org_id: orgId, p_since: since });
    if (pg.error) continue;
    const counts = compareRuns(convex, (pg.data ?? []) as Array<{ id: string; status: string }>);
    const drift = counts.missingInPostgres + counts.missingInConvex + counts.statusMismatch;
    if (drift > 0) drifted += 1;
    rows.push({
      org_id: orgId,
      checked_at: now.toISOString(),
      window_hours: WINDOW_HOURS,
      convex_runs: counts.convexRuns,
      postgres_runs: counts.postgresRuns,
      missing_in_postgres: counts.missingInPostgres,
      missing_in_convex: counts.missingInConvex,
      status_mismatch: counts.statusMismatch,
      sample_run_ids: counts.sample.filter((id) => /^[0-9a-f-]{36}$/i.test(id)),
    });
  }
  if (rows.length) await db.from("live_record_drift").insert(rows);
  if (drifted > 0) {
    await notifyDaAlert({
      kind: "live_record_drift",
      title: `The agent record and its copy disagree in ${drifted} workspace${drifted === 1 ? "" : "s"}`,
      checkFirst: "Agent Health, the copy section, then the copy outbox (live_record_outbox, phase replicate).",
      severity: "warning",
      detail: { workspaces: orgIds.length, drifted },
    });
  }
  return { workspaces: orgIds.length, drifted };
}
