/**
 * The rules of an agent task that need no database: which status may follow which, what an expected return
 * must look like, which wording is refused, which column a task sits in and how a column is ranked.
 *
 * Honesty rules. An expected return is an estimate: a range in one measure with its basis ("Inference" or
 * "Your data"), or "Not enough data" with no numbers. Never a single confident figure, and never wording
 * that claims a result. What actually happened is only ever shown in the Result column, from a check-in
 * recorded through the outcome loop (convex/decisions.ts).
 */
import { BASIS_LABEL } from "./evidence";
import { userError } from "./errors";
import type { ExpectedReturn, TaskColumn, TaskStatus } from "./taskShapes";

/** Which status may follow which. Anything not listed is refused. */
export const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  /** A person approves or skips. */
  proposed: ["approved", "declined"],
  /** The agent starts (running), asks something first (needsYou), or the change is simply made (done). */
  approved: ["running", "needsYou", "done", "declined"],
  running: ["needsYou", "done"],
  needsYou: ["running", "done", "declined"],
  /** Finished. A check-in coming due asks the person what happened. */
  done: ["needsYou"],
  /** Skipped work can be proposed again. */
  declined: ["proposed"],
};

export function canMove(from: TaskStatus, to: TaskStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function assertMove(from: TaskStatus, to: TaskStatus) {
  if (!canMove(from, to)) throw userError("That task has moved on, so this cannot be done to it now.");
}

/** Wording that claims a result. An estimate may say what is expected, never what will happen. */
const CLAIMS: readonly RegExp[] = [
  /\bwill\s+(?:increase|double|triple|grow|boost|raise|lift|improve|generate|bring|deliver|get\s+you|add|cut|reduce|lower|win|convert)\b/i,
  // "A guarantee" is a thing an offer can carry and may be tested; "guaranteed" and "we guarantee" are promises.
  /\b(?:proven|guaranteed|certain\s+to|sure\s+to|bound\s+to|definitely|without\s+fail|risk[-\s]?free|can(?:no|')t\s+fail)\b/i,
  /\b(?:we|i|this|it|vistrial)\s+guarantees?\b/i,
  /\b\d+\s*x\s+(?:your|the)\b/i,
];

export const CLAIM_WORDS = "This reads as a promise. Say what is expected and on what basis, not what will happen.";

/** True when text claims a result ("will increase", "proven", "guaranteed"). */
export function claimsResult(text: string): boolean {
  return CLAIMS.some((pattern) => pattern.test(text));
}

export function refuseClaims(...texts: (string | undefined)[]) {
  for (const text of texts) if (text && claimsResult(text)) throw userError(CLAIM_WORDS);
}

const clip = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);

/**
 * An expected return as it may be stored, or a refusal. "insufficient" carries nothing. The other two need
 * a measure and a real range: both ends, low below high, so a single number can never pass as a forecast.
 */
export function cleanExpectedReturn(input: ExpectedReturn): ExpectedReturn {
  if (input.basis === "insufficient") return { basis: "insufficient" };
  const metric = clip(input.metric ?? "", 60);
  if (!metric) throw userError("Say what the expected return is measured in, such as booked calls.");
  refuseClaims(metric);
  const { low, high } = input;
  if (low === undefined || high === undefined || !Number.isFinite(low) || !Number.isFinite(high)) throw userError("An expected return is a range: give both ends.");
  if (low < 0 || high <= low) throw userError("An expected return is a range: the low end must be below the high end.");
  return { basis: input.basis, metric, period: input.period ?? "month", low, high };
}

const PERIOD_WORDS = { week: "a week", month: "a month", quarter: "a quarter" } as const;
const MONTHLY = { week: 52 / 12, month: 1, quarter: 1 / 3 } as const;

const number = (value: number) => (Number.isInteger(value) ? value.toLocaleString("en-US") : value.toLocaleString("en-US", { maximumFractionDigits: 1 }));

/** How an expected return reads: "4 to 9 more booked calls a month", with its basis label beside it. */
export function expectedReturnWords(value: ExpectedReturn): { text: string; basis: string } {
  if (value.basis === "insufficient" || value.low === undefined || value.high === undefined) return { text: BASIS_LABEL.insufficient, basis: BASIS_LABEL.insufficient };
  return { text: `${number(value.low)} to ${number(value.high)} more ${value.metric} ${PERIOD_WORDS[value.period ?? "month"]}`, basis: BASIS_LABEL[value.basis] };
}

/** The number a task is ranked by: the middle of its range, per month. Null when there is not enough data. */
export function returnScore(value: ExpectedReturn): number | null {
  if (value.basis === "insufficient" || value.low === undefined || value.high === undefined) return null;
  return ((value.low + value.high) / 2) * MONTHLY[value.period ?? "month"];
}

type Rankable = { expectedReturn: ExpectedReturn; creditCost: number; createdAt: number };

/**
 * The order inside a column: the larger expected return first; tasks with not enough data after every task
 * that has a range; then the cheaper one; then the newer one.
 */
export function rankTasks<T extends Rankable>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const x = returnScore(a.expectedReturn);
    const y = returnScore(b.expectedReturn);
    if (x === null && y !== null) return 1;
    if (y === null && x !== null) return -1;
    if (x !== null && y !== null && x !== y) return y - x;
    return a.creditCost - b.creditCost || b.createdAt - a.createdAt;
  });
}

/** What the things a task is linked to say right now. Each is null when the task has no such link. */
export type TaskLinks = {
  /** The conversation the agent's work started in. */
  intake: { status: "chatting" | "thinking" | "ready" | "started" | "abandoned" } | null;
  run: { status: "queued" | "running" | "waiting" | "needsInput" | "completed" | "failed" | "stopped" } | null;
  /** What the run produced, if anything. */
  asset: { status: string } | null;
  decision: { checkInAt: number; outcome: boolean } | null;
};

export type TaskState = {
  status: TaskStatus;
  column: TaskColumn | null;
  /** Why it is where it is, in a few words, for the card. */
  note: string | null;
};

const day = (time: number) => new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Where a task stands, read from what it is linked to rather than remembered: its agent's conversation and
 * run, the draft that run produced, and the decision its result is measured through. A skipped task is in
 * no column. The stored status is brought in line with this whenever a task is read for writing.
 */
export function taskState(stored: TaskStatus, links: TaskLinks, now: number): TaskState {
  if (stored === "proposed") return { status: "proposed", column: "proposed", note: null };
  if (stored === "declined") return { status: "declined", column: null, note: null };
  const { intake, run, asset, decision } = links;
  // A person marked it finished: only a check-in coming due can ask for them again.
  if (stored === "done") {
    if (decision?.outcome) return { status: "done", column: "result", note: null };
    if (decision && decision.checkInAt <= now) return { status: "needsYou", column: "needsYou", note: "The check-in is due: say what happened." };
    return { status: "done", column: "done", note: decision ? `Check-in on ${day(decision.checkInAt)}.` : null };
  }
  if (decision) {
    if (decision.outcome) return { status: "done", column: "result", note: null };
    if (decision.checkInAt <= now) return { status: "needsYou", column: "needsYou", note: "The check-in is due: say what happened." };
    if (!run && !intake) return { status: "approved", column: "approved", note: `Being tried. Check-in on ${day(decision.checkInAt)}.` };
  }
  if (run) {
    if (run.status === "queued" || run.status === "running") return { status: "running", column: "running", note: null };
    if (run.status === "waiting" || run.status === "needsInput") return { status: "needsYou", column: "needsYou", note: "The agent asked a question." };
    if (run.status === "failed" || run.status === "stopped") return { status: "needsYou", column: "needsYou", note: run.status === "failed" ? "The work failed. Open it to see why." : "The work was stopped before it finished." };
    if (asset && (asset.status === "draft" || asset.status === "needsReview")) return { status: "needsYou", column: "needsYou", note: "A draft is ready to review." };
    return { status: "done", column: "done", note: decision ? `Check-in on ${day(decision.checkInAt)}.` : null };
  }
  if (intake) {
    if (intake.status === "abandoned") return { status: "needsYou", column: "needsYou", note: "The conversation was set aside before any work started." };
    if (intake.status === "started") return { status: "running", column: "running", note: null };
    return { status: "needsYou", column: "needsYou", note: intake.status === "ready" ? "The plan and its budget are ready: start the work." : "The agent has a question before it starts." };
  }
  if (stored === "running") return { status: "running", column: "running", note: null };
  if (stored === "needsYou") return { status: "needsYou", column: "needsYou", note: null };
  return { status: "approved", column: "approved", note: null };
}
