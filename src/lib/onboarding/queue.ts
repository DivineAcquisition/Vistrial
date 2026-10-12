import type { Tone } from "@/components/ui/tone";

import type { QueueRow } from "./load";
import { daysSince, isPhase, type Phase, type WaitingOn } from "./stages";

/** How worried the team should be about one workspace's setup. */
export type QueueRisk = "stuck" | "slow" | "review" | "fine";

export const QUEUE_RISK_LABEL: Record<QueueRisk, { label: string; tone: Tone }> = {
  stuck: { label: "Stuck", tone: "critical" },
  slow: { label: "Slow", tone: "warning" },
  review: { label: "Needs review", tone: "brand" },
  fine: { label: "On track", tone: "good" },
};

/** Waiting this many days is "slow"; the stuck rule itself lives in the database. */
export const SLOW_AFTER_DAYS = 3;

export function queueRisk(row: Pick<QueueRow, "stuck" | "phase" | "waiting_since" | "waiting_on">, now = Date.now()): QueueRisk {
  if (row.stuck) return "stuck";
  if (row.phase === "ready_for_review") return "review";
  const waited = daysSince(row.waiting_since, now);
  if (row.waiting_on !== "nobody" && waited !== null && waited >= SLOW_AFTER_DAYS) return "slow";
  return "fine";
}

export type QueueFilters = {
  phase: Phase | "open" | "";
  waiting: WaitingOn | "";
  risk: QueueRisk | "";
  q: string;
  mine: boolean;
  settled: boolean;
};

const WAITING = new Set<WaitingOn>(["customer", "team", "both", "nobody"]);
const RISK = new Set<QueueRisk>(["stuck", "slow", "review", "fine"]);

/** Read the queue filters from the address bar, ignoring anything unknown. */
export function readQueueFilters(params: Record<string, string | string[] | undefined>): QueueFilters {
  const one = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  };
  const phase = one("phase");
  const waiting = one("waiting");
  const risk = one("risk");
  return {
    phase: phase === "open" || isPhase(phase) ? (phase as QueueFilters["phase"]) : "",
    waiting: WAITING.has(waiting as WaitingOn) ? (waiting as WaitingOn) : "",
    risk: RISK.has(risk as QueueRisk) ? (risk as QueueRisk) : "",
    q: one("q").slice(0, 80),
    mine: one("mine") === "1",
    settled: one("settled") === "1",
  };
}

/** The filters as address-bar parameters, leaving out the empty ones. */
export function queueParams(filters: QueueFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.phase) out.phase = filters.phase;
  if (filters.waiting) out.waiting = filters.waiting;
  if (filters.risk) out.risk = filters.risk;
  if (filters.q) out.q = filters.q;
  if (filters.mine) out.mine = "1";
  if (filters.settled) out.settled = "1";
  return out;
}

const OPEN_PHASES = new Set<Phase>(["setup", "ready_for_review", "activating", "live", "paused"]);

export function filterQueue(rows: QueueRow[], filters: QueueFilters, userId: string, now = Date.now()): QueueRow[] {
  const q = filters.q.toLowerCase();
  return rows.filter((row) => {
    if (filters.phase === "open" && !OPEN_PHASES.has(row.phase)) return false;
    if (filters.phase && filters.phase !== "open" && row.phase !== filters.phase) return false;
    if (filters.waiting && row.waiting_on !== filters.waiting) return false;
    if (filters.risk && queueRisk(row, now) !== filters.risk) return false;
    if (filters.mine && !row.assigned.some((person) => person.user_id === userId)) return false;
    if (q && !`${row.name} ${row.slug}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

const RISK_ORDER: Record<QueueRisk, number> = { stuck: 0, review: 1, slow: 2, fine: 3 };

/** Stuck first, then waiting on review, then slow, then the longest-waiting. */
export function sortQueue(rows: QueueRow[], now = Date.now()): QueueRow[] {
  return [...rows].sort((a, b) => {
    const risk = RISK_ORDER[queueRisk(a, now)] - RISK_ORDER[queueRisk(b, now)];
    if (risk) return risk;
    const waitA = a.waiting_since ? Date.parse(a.waiting_since) : Number.POSITIVE_INFINITY;
    const waitB = b.waiting_since ? Date.parse(b.waiting_since) : Number.POSITIVE_INFINITY;
    if (waitA !== waitB) return waitA - waitB;
    return a.name.localeCompare(b.name);
  });
}
