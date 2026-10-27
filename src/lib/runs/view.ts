/**
 * View types for the run screens, and the plain words they show.
 *
 * Components take these types only. The container maps Convex rows into them,
 * and the story page builds them from fake data, so every screen state can be
 * reviewed without a backend. Nothing here ever carries model, page, or ad text.
 */

import type { Tone } from "@/components/ui/tone";

export type RunStatus = "queued" | "running" | "waiting" | "completed" | "failed" | "stopped";
export type StopReason = "done" | "cap" | "error" | "cancelled" | "halted";
export type SourceState = "ok" | "unavailable" | "blocked" | "partial";

export type RunStepView = {
  id: string;
  index: number;
  kind: "tool" | "model" | "note";
  toolSlug: string | null;
  workKind: string | null;
  status: "completed" | "failed";
  resultCode: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
};

export type StepGroup =
  | { type: "single"; key: string; step: RunStepView }
  | { type: "group"; key: string; toolSlug: string; steps: RunStepView[] };

export type SourceStatusView = { source: string; state: SourceState; reasonCode: string | null };

export type RunArtifactView = { id: string; kind: string; byteSize: number };

export type RunAssetView = {
  id: string;
  title: string;
  kind: string;
  status: "draft" | "approved" | "archived";
  currentVersion: number;
};

export type CostView = {
  spentCents: number;
  runCapCents: number;
  softWarningCents: number;
  daySpentCents: number;
  dayCapCents: number;
  inputTokens: number;
  outputTokens: number;
};

export type RunView = {
  id: string;
  agentSlug: string;
  skillSlug: string;
  status: RunStatus;
  stopReason: StopReason | null;
  startedAt: number;
  finishedAt: number | null;
  startedByName: string | null;
  maxSteps: number;
  maxDurationMs: number;
  cost: CostView;
  steps: RunStepView[];
  sources: SourceStatusView[];
  artifacts: RunArtifactView[];
  assets: RunAssetView[];
};

/** The shape `runs.get` returns. Kept loose on strings so a new code never breaks the screen. */
export type RunRow = {
  id: string;
  agentSlug: string;
  skillSlug: string;
  status: string;
  stopReason: string | null;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
  startedAt: number;
  finishedAt: number | null;
  startedByName: string | null;
  caps: {
    maxCostCentsPerRun: number;
    maxCostCentsPerDay: number;
    maxSteps: number;
    maxDurationMs: number;
    softWarningCents: number;
  };
  daySpentCents: number;
  steps: Array<Omit<RunStepView, "kind" | "status"> & { kind: string; status: string }>;
  artifacts: RunArtifactView[];
  assets: Array<Omit<RunAssetView, "status"> & { status: string }>;
};

const RUN_STATUSES: RunStatus[] = ["queued", "running", "waiting", "completed", "failed", "stopped"];
const STOP_REASONS: StopReason[] = ["done", "cap", "error", "cancelled", "halted"];

/** An unknown status reads as failed, so a new backend value never looks like healthy progress. */
export function asRunStatus(value: string): RunStatus {
  return (RUN_STATUSES as string[]).includes(value) ? (value as RunStatus) : "failed";
}

export function asStopReason(value: string | null): StopReason | null {
  return value && (STOP_REASONS as string[]).includes(value) ? (value as StopReason) : null;
}

export function toRunView(row: RunRow): RunView {
  return {
    id: row.id,
    agentSlug: row.agentSlug,
    skillSlug: row.skillSlug,
    status: asRunStatus(row.status),
    stopReason: asStopReason(row.stopReason),
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    startedByName: row.startedByName,
    maxSteps: row.caps.maxSteps,
    maxDurationMs: row.caps.maxDurationMs,
    cost: {
      spentCents: row.costCents,
      runCapCents: row.caps.maxCostCentsPerRun,
      softWarningCents: row.caps.softWarningCents,
      daySpentCents: row.daySpentCents,
      dayCapCents: row.caps.maxCostCentsPerDay,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
    },
    steps: row.steps.map((step) => ({
      ...step,
      kind: step.kind === "model" || step.kind === "note" ? step.kind : "tool",
      status: step.status === "failed" ? "failed" : "completed",
    })),
    sources: [],
    artifacts: row.artifacts,
    assets: row.assets.map((asset) => ({
      ...asset,
      status: asset.status === "approved" || asset.status === "archived" ? asset.status : "draft",
    })),
  };
}

export function isOpen(status: RunStatus) {
  return status === "queued" || status === "running" || status === "waiting";
}

/* ---------------------------------------------------------------------------
 * Plain words
 * ------------------------------------------------------------------------- */

export const STATUS_META: Record<RunStatus, { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "neutral" },
  running: { label: "Running", tone: "brand" },
  waiting: { label: "Waiting on a person", tone: "warning" },
  completed: { label: "Completed", tone: "good" },
  failed: { label: "Failed", tone: "critical" },
  stopped: { label: "Stopped", tone: "warning" },
};

export const STOP_REASON_WORDS: Record<StopReason, string> = {
  done: "Finished its work.",
  cap: "Stopped at a limit.",
  error: "Stopped after an error.",
  cancelled: "Stopped because agents were paused.",
  halted: "Stopped by a person.",
};

const TOOL_LABELS: Record<string, { one: string; many: (count: number) => string }> = {
  "profile.read": { one: "Read the business profile", many: (n) => `Read the business profile ${n} times` },
  "asset.create": { one: "Saved the asset", many: (n) => `Saved ${n} assets` },
  "asset.addVersion": { one: "Added a version", many: (n) => `Added ${n} versions` },
  "test.echo": { one: "Ran the echo test", many: (n) => `Ran the echo test ${n} times` },
  "web.search": { one: "Searched the web", many: (n) => `Ran ${n} web searches` },
  "web.fetch": { one: "Read a page", many: (n) => `Read ${n} pages` },
  "library.meta": { one: "Read the Meta Ad Library", many: (n) => `Read ${n} Meta Ad Library pages` },
  "library.tiktok": { one: "Read the TikTok Creative Center", many: (n) => `Read ${n} TikTok Creative Center pages` },
  "library.google": { one: "Read the Google Ads Transparency Center", many: (n) => `Read ${n} Google Ads Transparency pages` },
  "swipe.read": { one: "Read the swipe file", many: (n) => `Read ${n} swipe file items` },
  "results.read": { one: "Read past results", many: (n) => `Read past results ${n} times` },
};

const WORK_KIND_LABELS: Record<string, string> = {
  research: "Researched",
  classify: "Sorted",
  write: "Wrote",
  summarize: "Summarized",
};

export const RESULT_CODE_WORDS: Record<string, string> = {
  ok: "Done.",
  no_route: "No model is set for this kind of work. A platform admin sets one.",
  no_confirmed_profile: "The business profile is not confirmed yet. An owner or manager confirms it.",
  tool_error: "That step could not finish.",
  provider_error: "The model service did not answer.",
  rate_limited: "The model service was busy.",
  auth_failed: "The model service did not accept our key. A platform admin fixes this.",
  bad_request: "The model service did not accept the request.",
  connection_failed: "The model service could not be reached.",
  refused: "The model declined this request.",
  no_key: "No model key is set. A platform admin adds one.",
  unpriced_model: "This model has no price set, so it cannot run.",
  unknown_provider: "This model provider is not known.",
};

export function stepLabel(step: Pick<RunStepView, "kind" | "toolSlug" | "workKind">) {
  if (step.kind === "model") return WORK_KIND_LABELS[step.workKind ?? ""] ?? "Used the model";
  if (step.kind === "note") return "Note";
  return TOOL_LABELS[step.toolSlug ?? ""]?.one ?? "Used a tool";
}

export function groupLabel(toolSlug: string, count: number) {
  return TOOL_LABELS[toolSlug]?.many(count) ?? `Used a tool ${count} times`;
}

export function resultWords(code: string) {
  return RESULT_CODE_WORDS[code] ?? "Finished with an unknown result.";
}

export const SOURCE_WORDS: Record<SourceState, { label: string; tone: Tone }> = {
  ok: { label: "Collected", tone: "good" },
  partial: { label: "Partly collected", tone: "warning" },
  unavailable: { label: "Unavailable", tone: "warning" },
  blocked: { label: "Blocked", tone: "critical" },
};

/* ---------------------------------------------------------------------------
 * Grouping
 * ------------------------------------------------------------------------- */

/**
 * Folds runs of the same tool into one expandable row ("Read 12 pages").
 * Keys come from the first step's id, so a group keeps its key as new steps
 * stream in and React does not remount rows that did not change.
 */
export function groupSteps(steps: RunStepView[]): StepGroup[] {
  const ordered = [...steps].sort((a, b) => a.index - b.index);
  const groups: StepGroup[] = [];
  for (const step of ordered) {
    const last = groups[groups.length - 1];
    const sameTool =
      step.kind === "tool" &&
      step.toolSlug !== null &&
      last !== undefined &&
      ((last.type === "group" && last.toolSlug === step.toolSlug) ||
        (last.type === "single" && last.step.kind === "tool" && last.step.toolSlug === step.toolSlug));
    if (sameTool && last.type === "group") {
      last.steps.push(step);
    } else if (sameTool && last.type === "single") {
      groups[groups.length - 1] = { type: "group", key: last.key, toolSlug: step.toolSlug!, steps: [last.step, step] };
    } else {
      groups.push({ type: "single", key: step.id, step });
    }
  }
  return groups;
}

/* ---------------------------------------------------------------------------
 * Numbers in words
 * ------------------------------------------------------------------------- */

/** "$0.42", or "under 1¢" for fractions of a cent. */
export function formatCents(cents: number) {
  if (cents > 0 && cents < 1) return "under 1¢";
  if (cents < 100) return `${Math.round(cents)}¢`;
  return `$${(cents / 100).toFixed(2)}`;
}

/** What a screen reader says for a cost: "42 cents", "1 dollar and 5 cents". */
export function centsInWords(cents: number) {
  if (cents > 0 && cents < 1) return "less than 1 cent";
  const whole = Math.round(cents);
  const dollars = Math.floor(whole / 100);
  const rest = whole % 100;
  const centWords = `${rest} ${rest === 1 ? "cent" : "cents"}`;
  if (dollars === 0) return centWords;
  const dollarWords = `${dollars} ${dollars === 1 ? "dollar" : "dollars"}`;
  return rest === 0 ? dollarWords : `${dollarWords} and ${centWords}`;
}

/** "under 1s", "45s", "3m 05s", "1h 02m". */
export function formatDuration(ms: number) {
  if (ms < 1000) return "under 1s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** One plain sentence about the run, from codes and numbers only. */
export function summaryLine(run: RunView) {
  const steps = run.steps.length;
  const stepWords = `${steps} ${steps === 1 ? "step" : "steps"}`;
  const madeAsset = run.assets.length > 0;
  switch (run.status) {
    case "queued":
      return "Waiting to start.";
    case "running":
      return `Working. ${stepWords} so far.`;
    case "waiting":
      return `Waiting on a person after ${stepWords}.`;
    case "completed":
      return madeAsset
        ? `Finished after ${stepWords}. The draft is waiting for approval.`
        : `Finished after ${stepWords}.`;
    case "failed": {
      const failed = run.steps.find((step) => step.status === "failed");
      const reason = failed ? ` ${resultWords(failed.resultCode)}` : "";
      return `Stopped after ${stepWords}.${reason}`;
    }
    case "stopped": {
      const reason = run.stopReason ? STOP_REASON_WORDS[run.stopReason] : "Stopped.";
      const saved = madeAsset ? " Saved what it had." : steps > 0 ? " Nothing was saved." : "";
      return `${reason} ${stepWords} ran.${saved}`;
    }
  }
}

/** The polite announcement for the newest finished step, or null when there is none. */
export function stepAnnouncement(steps: RunStepView[]) {
  const latest = [...steps].sort((a, b) => b.index - a.index)[0];
  if (!latest) return null;
  const outcome = latest.status === "failed" ? "could not finish" : "finished";
  return `Step ${latest.index + 1} ${outcome}: ${stepLabel(latest)}.`;
}
