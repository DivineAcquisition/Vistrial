import "server-only";

import type { GhlDb } from "@/lib/ghl/tokens";
import {
  INJECTED_CATCH_ALERT_MIN_N,
  PASS_RATE_ALERT_MIN_N,
  SAMPLE_AUDIT_BATCH,
  SAMPLE_AUDIT_LOOKBACK_DAYS,
  VERIFICATION_TASKS,
  type VerificationTask,
} from "@/lib/verification/constants";
import { injectedSuitePassed, runInjectedFaultSuite } from "@/lib/verification/injected";
import { shouldAlertInjectedCatch, shouldAlertPassRate } from "@/lib/verification/metrics";
import type { Json } from "@/types/database";

async function upsertAlert(
  db: GhlDb,
  args: {
    fingerprint: string;
    kind: string;
    severity: "warning" | "critical";
    title: string;
    checkFirst: string;
    detail: Record<string, unknown>;
    orgId?: string | null;
  }
) {
  await db.rpc("upsert_ops_alert", {
    p_fingerprint: args.fingerprint,
    p_kind: args.kind,
    p_severity: args.severity,
    p_org_id: args.orgId ?? null,
    p_title: args.title,
    p_check_first: args.checkFirst,
    p_detail: args.detail as Json,
  });
}

async function queueSampleAudits(db: GhlDb): Promise<number> {
  const since = new Date(Date.now() - SAMPLE_AUDIT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: passed } = await db
    .from("verification_runs")
    .select("id, org_id, task")
    .eq("final_state", "passed")
    .eq("model_invoked", true)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(80);
  if (!passed?.length) return 0;

  const { data: existing } = await db
    .from("verification_sample_audits")
    .select("run_id")
    .in(
      "run_id",
      passed.map((row) => row.id)
    );
  const taken = new Set((existing ?? []).map((row) => row.run_id));
  const candidates = passed.filter((row) => !taken.has(row.id));
  const picked = candidates.slice(0, SAMPLE_AUDIT_BATCH);
  if (!picked.length) return 0;

  const { error } = await db.from("verification_sample_audits").insert(
    picked.map((row) => ({
      run_id: row.id,
      org_id: row.org_id,
      task: row.task,
    }))
  );
  if (error) return 0;
  return picked.length;
}

async function runInjectedAndStore(db: GhlDb) {
  const results = runInjectedFaultSuite();
  await db.from("verification_injected_runs").insert(
    results.map((row) => ({
      task: row.type === "invented_commitment" ? "draft" : "extraction",
      fault_type: row.type,
      caught: row.caught,
      details: { stage: row.stage, codes: row.codes } as Json,
    }))
  );
  const caught = results.filter((row) => row.caught).length;
  if (shouldAlertInjectedCatch(caught, results.length) || !injectedSuitePassed(results)) {
    await upsertAlert(db, {
      fingerprint: "verification:injected_faults",
      kind: "verification_injected",
      severity: "critical",
      title: "Verification missed an injected fault",
      checkFirst:
        "Turn the failing task off on Operator until the verifier catches fabricated quotes, wrong speakers, unsupported claims, and invented commitments.",
      detail: { results },
    });
  } else {
    await db.rpc("resolve_ops_alert", { p_fingerprint: "verification:injected_faults" });
  }
  return results;
}

async function alertPassRates(db: GhlDb) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  for (const task of VERIFICATION_TASKS) {
    if (task === "reporting" || task === "agent_response") continue;
    const { data } = await db
      .from("verification_runs")
      .select("final_state")
      .eq("task", task)
      .eq("model_invoked", true)
      .gte("created_at", since);
    const passed = (data ?? []).filter((row) => row.final_state === "passed").length;
    const flagged = (data ?? []).filter((row) => row.final_state === "flagged").length;
    const fingerprint = `verification:pass_rate:${task}`;
    if (shouldAlertPassRate(passed, flagged)) {
      await upsertAlert(db, {
        fingerprint,
        kind: "verification_pass_rate",
        severity: "warning",
        title: `Verification pass rate for ${task} is near 100%`,
        checkFirst:
          "A verifier that almost never finds faults has stopped working. Review a sample of passed output, then turn the task off if accuracy is poor.",
        detail: { task, passed, flagged, n: passed + flagged, minN: PASS_RATE_ALERT_MIN_N },
      });
    } else if (passed + flagged >= PASS_RATE_ALERT_MIN_N) {
      await db.rpc("resolve_ops_alert", { p_fingerprint: fingerprint });
    }
  }
}

export async function runVerificationAuditJob(db: GhlDb): Promise<{
  queuedSamples: number;
  injectedCaught: number;
  injectedTotal: number;
}> {
  const queuedSamples = await queueSampleAudits(db);
  const injected = await runInjectedAndStore(db);
  await alertPassRates(db);
  return {
    queuedSamples,
    injectedCaught: injected.filter((row) => row.caught).length,
    injectedTotal: injected.length,
  };
}
