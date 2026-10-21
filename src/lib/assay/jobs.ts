import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { scoreWorkspace, type ScoreCause } from "@/lib/assay/score-org";
import { supabaseAssayStore } from "@/lib/assay/store";
import type { Database } from "@/types/database";

type Db = SupabaseClient<Database>;
type Loose = SupabaseClient;

type JobRow = {
  id: string;
  org_id: string;
  lead_id: string | null;
  cause: ScoreCause;
  dedupe_key: string;
  silent: boolean;
  attempts: number;
};

const BATCH = 50;
const MAX_ATTEMPTS = 6;
const HELD_RECHECK_MS = 5 * 60_000;

/**
 * Ask for a lead to be rescored. Webhook receivers and agents call this; the
 * scoring itself runs from the queue. A replayed event lands on the same key
 * and adds nothing.
 */
export async function requestAssayScore(
  db: Db,
  args: { orgId: string; leadId: string; cause?: ScoreCause; key: string; silent?: boolean; eventAt?: string | null }
): Promise<void> {
  const { error } = await (db as unknown as Loose).rpc("assay_request_score", {
    p_org_id: args.orgId,
    p_lead_id: args.leadId,
    p_cause: args.cause ?? "event",
    p_dedupe_key: args.key,
    p_silent: args.silent ?? false,
    p_event_at: args.eventAt ?? new Date().toISOString(),
  });
  if (error) console.error("[vistrial] assay request failed", { leadId: args.leadId, code: error.code });
}

/**
 * Work the queue: lead rescores in one pass per workspace, and whole
 * workspace runs (the silent first scoring, rules changes). Logs carry ids
 * and counts only.
 */
export async function runAssayJobs(db: Db, now = new Date()): Promise<{ jobs: number; scored: number; failed: number }> {
  const loose = db as unknown as Loose;
  const { data, error } = await loose
    .from("assay_jobs")
    .select("id, org_id, lead_id, cause, dedupe_key, silent, attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", now.toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH);
  if (error) throw new Error("assay_jobs_read_failed");
  const queued = (data ?? []) as JobRow[];
  if (!queued.length) return { jobs: 0, scored: 0, failed: 0 };

  // Paused, halted, stopped or switched off: the jobs wait, out of the way of
  // other workspaces. They are kept, and catch-up after a pause is quiet.
  const held = new Set<string>();
  for (const orgId of new Set(queued.map((job) => job.org_id))) {
    const { data: may, error: mayError } = await loose.rpc("agent_may_run", { p_org_id: orgId, p_agent_id: "assay", p_sample: false });
    if (mayError || (may as { ok?: boolean } | null)?.ok !== true) held.add(orgId);
  }
  if (held.size) {
    await loose
      .from("assay_jobs")
      .update({ next_attempt_at: new Date(now.getTime() + HELD_RECHECK_MS).toISOString() })
      .in("org_id", [...held])
      .eq("status", "pending");
  }
  const pending = queued.filter((job) => !held.has(job.org_id));

  const claimed: JobRow[] = [];
  for (const job of pending) {
    const { data: row } = await loose
      .from("assay_jobs")
      .update({ status: "running", claimed_at: now.toISOString(), attempts: job.attempts + 1 })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (row) claimed.push(job);
  }

  const store = supabaseAssayStore(db);
  let scored = 0;
  let failed = 0;

  const byOrg = new Map<string, JobRow[]>();
  for (const job of claimed) byOrg.set(job.org_id, [...(byOrg.get(job.org_id) ?? []), job]);

  for (const [orgId, jobs] of byOrg) {
    const whole = jobs.filter((job) => job.lead_id === null);
    const leads = jobs.filter((job) => job.lead_id !== null);
    const batches: Array<{ jobs: JobRow[]; ids: string[] | null; cause: ScoreCause; silent: boolean }> = [
      ...whole.map((job) => ({ jobs: [job], ids: null, cause: job.cause, silent: job.silent })),
    ];
    if (leads.length) {
      batches.push({
        jobs: leads,
        ids: [...new Set(leads.map((job) => job.lead_id as string))],
        cause: leads.some((job) => !job.silent) ? "event" : leads[0].cause,
        silent: leads.every((job) => job.silent),
      });
    }

    for (const batch of batches) {
      try {
        const run = await scoreWorkspace(store, orgId, { cause: batch.cause, historic: batch.silent, ids: batch.ids, now: now.toISOString() });
        scored += run.scored;
        if (batch.cause === "migration") {
          await loose.rpc("assay_finish_migration", { p_org_id: orgId, p_scored: run.scored });
          if (run.ignoredFields.length) {
            console.info("[vistrial] assay ignored fields", { orgId, count: run.ignoredFields.length });
          }
        }
        await loose.from("assay_jobs").update({ status: "done", last_error: null }).in("id", batch.jobs.map((job) => job.id));
      } catch (cause) {
        failed += batch.jobs.length;
        const code = cause instanceof Error ? cause.message.slice(0, 60) : "assay_failed";
        for (const job of batch.jobs) {
          const dead = job.attempts + 1 >= MAX_ATTEMPTS;
          await loose
            .from("assay_jobs")
            .update({
              status: dead ? "failed" : "pending",
              last_error: code,
              next_attempt_at: new Date(now.getTime() + 2 ** (job.attempts + 1) * 60_000).toISOString(),
            })
            .eq("id", job.id);
        }
        console.error("[vistrial] assay scoring failed", { orgId, jobs: batch.jobs.length, code });
      }
    }
  }

  return { jobs: claimed.length, scored, failed };
}
