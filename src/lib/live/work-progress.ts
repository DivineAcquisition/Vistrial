import { OPEN_RUN_STATUSES, type LiveRun, type LiveStep, type RunStatus } from "@/lib/live/model";

const STATUS_PERCENT: Record<RunStatus, number> = {
  queued: 10,
  working: 40,
  waiting_person: 70,
  waiting_provider: 60,
  paused: 35,
  completed: 100,
  needs_person: 85,
  failed: 55,
  stopped: 40,
  expired: 30,
  stuck: 50,
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * How far a run has gotten, as a percent.
 * Recorded steps win. Otherwise the current step is located in the plan.
 */
export function workProgressPercent(
  run: Pick<LiveRun, "status" | "plan" | "currentStepLabel"> | null,
  steps: Array<Pick<LiveStep, "status">> = [],
): number {
  if (!run) return 0;
  if (run.status === "completed") return 100;

  if (steps.length > 0) {
    const planned = run.plan.map((label) => label.trim()).filter(Boolean).length;
    const total = Math.max(planned, steps.length, 1);
    let score = 0;
    for (const step of steps) {
      if (step.status === "done" || step.status === "skipped" || step.status === "failed") score += 1;
      else if (step.status === "working" || step.status === "waiting" || step.status === "paused") score += 0.45;
    }
    return clamp((score / total) * 100);
  }

  const plan = run.plan.map((label) => label.trim()).filter(Boolean);
  const step = run.currentStepLabel?.trim().toLowerCase() ?? "";
  const index = step ? plan.findIndex((label) => label.toLowerCase() === step) : -1;
  if (plan.length > 0 && index >= 0) {
    const intoStep = run.status === "working" || run.status === "queued" || run.status === "paused" ? 0.45 : 1;
    return clamp(((index + intoStep) / plan.length) * 100);
  }

  return STATUS_PERCENT[run.status] ?? 0;
}

/** Current work fills the bar. A finished or missing run stays at zero. */
export function agentMeterProgress(
  run: Pick<LiveRun, "status" | "plan" | "currentStepLabel"> | null,
  steps: Array<Pick<LiveStep, "status">> = [],
): number {
  const open = run != null && OPEN_RUN_STATUSES.includes(run.status);
  if (!open) return 0;
  return workProgressPercent(run, steps);
}

/** The open run when there is one, otherwise the latest run for this agent. */
export function pickCurrentRun(runs: LiveRun[], agentId: LiveRun["agentId"]): LiveRun | null {
  const mine = runs
    .filter((run) => run.agentId === agentId)
    .sort((a, b) => b.lastProgressAt.localeCompare(a.lastProgressAt));
  return mine.find((run) => OPEN_RUN_STATUSES.includes(run.status)) ?? mine[0] ?? null;
}
