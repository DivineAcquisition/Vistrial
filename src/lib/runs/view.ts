/**
 * View types for the run screens, and the plain words they show.
 *
 * Components take these types only. The container maps Convex rows into them,
 * and the story page builds them from fake data, so every screen state can be
 * reviewed without a backend. Nothing here ever carries model, page, or ad text.
 */

import type { Tone } from "@/components/ui/tone";

export type RunStatus = "queued" | "running" | "waiting" | "needsInput" | "completed" | "failed" | "stopped";
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
  /** The skill's name for the step (brief, classify, write...). */
  phase?: string | null;
  /** The model a model step ran on, from the route stored with it. */
  model?: RunModel | null;
};

/** A model as a screen shows it: its family, for the maker's mark, and its plain name. */
export type RunModel = { family: "claude" | "gpt" | "gemini"; name: string };

export type StepGroup =
  | { type: "single"; key: string; step: RunStepView }
  | { type: "group"; key: string; toolSlug: string; steps: RunStepView[] };

export type SourceStatusView = { source: string; state: SourceState; reasonCode: string | null };

export type RunArtifactView = { id: string; kind: string; byteSize: number };

export const ASSET_STATUSES = ["draft", "needsReview", "approved", "rejected", "archived"] as const;

export type RunAssetView = {
  id: string;
  title: string;
  kind: string;
  status: "draft" | "needsReview" | "approved" | "rejected" | "archived";
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
  /** The model that did this run's writing, as stored when it ran. Missing on older runs. */
  model?: RunModel | null;
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
  model?: RunModel | null;
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

const RUN_STATUSES: RunStatus[] = ["queued", "running", "waiting", "needsInput", "completed", "failed", "stopped"];
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
    model: row.model ?? null,
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
      status: ASSET_STATUSES.includes(asset.status as RunAssetView["status"]) ? (asset.status as RunAssetView["status"]) : "draft",
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
  waiting: { label: "Waiting for User", tone: "warning" },
  needsInput: { label: "Needs Input — Timed Out", tone: "critical" },
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
  "source.web": { one: "Kept what the web search found", many: (n) => `Kept web results ${n} times` },
  "source.youtube": { one: "Searched YouTube", many: (n) => `Searched YouTube ${n} times` },
  "source.tiktok": { one: "Checked TikTok links", many: (n) => `Checked TikTok links ${n} times` },
  "source.instagram": { one: "Checked Instagram links", many: (n) => `Checked Instagram links ${n} times` },
  "source.metaAdLibrary": { one: "Checked the Meta Ad Library", many: (n) => `Checked the Meta Ad Library ${n} times` },
  "context.read": { one: "Read the business context", many: (n) => `Read the business context ${n} times` },
  "mi.applyClassification": { one: "Saved the classifications", many: (n) => `Saved classifications ${n} times` },
  "mi.compute": { one: "Counted and grouped the sources", many: (n) => `Counted the sources ${n} times` },
  "mi.check": { one: "Checked the report", many: (n) => `Checked the report ${n} times` },
  "mi.save": { one: "Saved the report", many: (n) => `Saved ${n} reports` },
  "oi.context": { one: "Read the approved research and business context", many: (n) => `Read the approved research ${n} times` },
  "oi.check": { one: "Checked the offer analysis", many: (n) => `Checked the offer analysis ${n} times` },
  "oi.save": { one: "Saved the offer analysis", many: (n) => `Saved ${n} offer analyses` },
  "cp.context": { one: "Read the brand, the reference and the business context", many: (n) => `Read the brand and the reference ${n} times` },
  "cp.check": { one: "Checked the wording and the claims", many: (n) => `Checked the creative ${n} times` },
  "cp.save": { one: "Saved the ad set", many: (n) => `Saved ${n} ad sets` },
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
  no_credit: "The model service account is out of credit. A platform admin adds some. You were not charged for this step.",
  blocked: "The model service did not allow this request.",
  no_provider: "No model host that meets our privacy rules was available. Try again in a few minutes.",
  web_search_off: "This model cannot search the web here yet.",
  unsupported_tool: "This model cannot do this step.",
  partial: "Done, but this source could not show everything. Its status says why.",
  unavailable: "This source could not be used this time. Its status says why.",
  awaiting_authorization: "This source is waiting for an account to be approved.",
  no_project: "This run has no research project.",
  no_approved_research: "No market report is approved yet. Approve one first: this analysis does not invent competitor offers.",
  no_research_sources: "The approved market reports cite no competitor sources, so there is nothing to compare the offer against.",
  no_creative_request: "This run has nothing to make a creative from. Start it from the Creative tab.",
  brand_missing: "The brand this creative was for is gone or was put away.",
  reference_missing: "The reference ad is no longer in this organization.",
  offer_missing: "The offer this creative was for is gone.",
  missing_context: "Something the research needs is missing.",
  waiting_for_user: "Asked a question and waited for an answer.",
  over_budget: "Skipped, because it could have spent the money held back for checking the report.",
  passed: "Every check passed.",
  checks_failed: "Some checks did not pass.",
  needs_review: "Saved as a draft that needs review.",
  undeclared_question: "The skill tried to ask a question it is not allowed to ask.",
  max_tokens: "The answer ran out of room.",
  invalid_output: "The answer was not in the required form.",
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
      return `Waiting for an answer after ${stepWords}. Nothing runs or spends until then.`;
    case "needsInput":
      return `No answer came within seven days, after ${stepWords}. Resume it to ask again.`;
    case "completed":
      return madeAsset
        ? run.assets.some((asset) => asset.status === "needsReview")
          ? `Finished after ${stepWords}. The draft did not pass every check and needs review.`
          : `Finished after ${stepWords}. The draft is waiting for approval.`
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
