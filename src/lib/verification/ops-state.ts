import type { GhlDb } from "@/lib/ghl/tokens";
import {
  INJECTED_CATCH_ALERT_THRESHOLD,
  PASS_RATE_ALERT_THRESHOLD,
  VERIFICATION_TASKS,
  type VerificationTask,
} from "@/lib/verification/constants";
import { ratio } from "@/lib/verification/metrics";

export type VerificationOpsState = {
  tasks: Array<{
    task: VerificationTask;
    enabled: boolean;
    disabledReason: string | null;
    disabledAt: string | null;
    passRate: number | null;
    modelN: number;
    passed: number;
    flagged: number;
  }>;
  sampleAudits: {
    pending: Array<{
      id: string;
      task: string;
      orgId: string;
      createdAt: string;
    }>;
    reviewed: number;
    missedFaultTotal: number;
    missedFaultAverage: number | null;
  };
  injected: {
    lastRunAt: string | null;
    lastResults: Array<{ faultType: string; caught: boolean; createdAt: string }>;
    catchRate: number | null;
  };
  falsePositives: {
    count7d: number;
    byTask: Array<{ task: string; count: number }>;
  };
  passRateAlertThreshold: number;
  injectedCatchAlertThreshold: number;
};

export async function loadVerificationOpsState(db: GhlDb): Promise<VerificationOpsState> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [
    { data: settings },
    { data: runs },
    { data: pendingAudits },
    { data: reviewedAudits },
    { data: injected },
    { data: falsePositives },
  ] = await Promise.all([
    db.from("verification_task_settings").select("*"),
    db
      .from("verification_runs")
      .select("task, final_state, model_invoked")
      .eq("model_invoked", true)
      .gte("created_at", since),
    db
      .from("verification_sample_audits")
      .select("id, task, org_id, created_at")
      .eq("reviewed", false)
      .order("created_at", { ascending: false })
      .limit(20),
    db
      .from("verification_sample_audits")
      .select("missed_fault_count")
      .eq("reviewed", true)
      .gte("created_at", since),
    db
      .from("verification_injected_runs")
      .select("fault_type, caught, created_at")
      .order("created_at", { ascending: false })
      .limit(16),
    db.from("verification_false_positives").select("task").gte("created_at", since),
  ]);

  const settingsByTask = new Map((settings ?? []).map((row) => [row.task, row]));
  const tasks = VERIFICATION_TASKS.map((task) => {
    const row = settingsByTask.get(task);
    const taskRuns = (runs ?? []).filter((item) => item.task === task);
    const passed = taskRuns.filter((item) => item.final_state === "passed").length;
    const flagged = taskRuns.filter((item) => item.final_state === "flagged").length;
    return {
      task,
      enabled: row ? row.enabled !== false : true,
      disabledReason: row?.disabled_reason ?? null,
      disabledAt: row?.disabled_at ?? null,
      passRate: ratio(passed, passed + flagged),
      modelN: passed + flagged,
      passed,
      flagged,
    };
  });

  const missed = (reviewedAudits ?? [])
    .map((row) => row.missed_fault_count)
    .filter((value): value is number => typeof value === "number");
  const missedFaultTotal = missed.reduce((sum, value) => sum + value, 0);

  const lastRunAt = injected?.[0]?.created_at ?? null;
  const recentInjected = (injected ?? []).slice(0, 4);
  const catchRate = ratio(
    recentInjected.filter((row) => row.caught).length,
    recentInjected.length
  );

  const fpCounts = new Map<string, number>();
  for (const row of falsePositives ?? []) {
    fpCounts.set(row.task, (fpCounts.get(row.task) ?? 0) + 1);
  }

  return {
    tasks,
    sampleAudits: {
      pending: (pendingAudits ?? []).map((row) => ({
        id: row.id,
        task: row.task,
        orgId: row.org_id,
        createdAt: row.created_at,
      })),
      reviewed: missed.length,
      missedFaultTotal,
      missedFaultAverage: ratio(missedFaultTotal, missed.length),
    },
    injected: {
      lastRunAt,
      lastResults: recentInjected.map((row) => ({
        faultType: row.fault_type,
        caught: row.caught,
        createdAt: row.created_at,
      })),
      catchRate,
    },
    falsePositives: {
      count7d: (falsePositives ?? []).length,
      byTask: [...fpCounts.entries()].map(([task, count]) => ({ task, count })),
    },
    passRateAlertThreshold: PASS_RATE_ALERT_THRESHOLD,
    injectedCatchAlertThreshold: INJECTED_CATCH_ALERT_THRESHOLD,
  };
}
