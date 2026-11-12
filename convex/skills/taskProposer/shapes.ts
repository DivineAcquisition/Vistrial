/**
 * The task proposer's shapes and the rules that need no database. The proposer never invents a task: it
 * chooses among candidates that already exist as items of the organization's own approved reports, and
 * code decides what an expected return may say.
 */
import { claimsResult } from "../../lib/agentTasks";
import type { ExpectedReturn, TaskEvidence } from "../../lib/taskShapes";

export const SKILL_SLUG = "task-proposer";
export const PHASE = { read: "read", choose: "choose", save: "save" } as const;

/** The most a weekly plan proposes, and the most one change does. */
export const MAX_WEEKLY = 5;
export const MAX_ON_CHANGE = 2;
export const MAX_CANDIDATES = 24;
/** An expected gain may not be larger than what the measure reads today: no more than doubling. */
export const MAX_GAIN_RATIO = 1;

export type Candidate = {
  id: string;
  /** "own" for the organization itself, or the client's id. */
  scope: string;
  clientId: string | null;
  clientName: string | null;
  kind: "opportunity" | "assetItem";
  title: string;
  action: string;
  howToTell: string;
  /** The report it comes from. */
  assetId: string | null;
  assetTitle: string | null;
  projectId: string | null;
  index: number;
};

export type PlanFigure = { id: string; scope: string; label: string; metric: "conversions" | "spend" | "revenue"; value: number; display: string };

export type PlanRecord = {
  planKey: string;
  weekly: boolean;
  candidates: Candidate[];
  figures: PlanFigure[];
  /** What was tried before and what happened, one line each. */
  outcomes: string[];
  goal: string | null;
  /** The one measure every expected return is stated in. */
  metric: string;
  finished: string[];
  due: string[];
};

export type Pick = { candidateId: string; why: string; low?: number; high?: number; figureIds?: string[] };
export type Choice = { picks: Pick[]; summary: string };

export const CHOICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["picks", "summary"],
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidateId", "why"],
        properties: { candidateId: { type: "string" }, why: { type: "string" }, low: { type: "number" }, high: { type: "number" }, figureIds: { type: "array", items: { type: "string" } } },
      },
    },
    summary: { type: "string" },
  },
} as const;

export function readChoice(value: unknown): Choice | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { picks?: unknown; summary?: unknown };
  if (!Array.isArray(raw.picks)) return null;
  const picks: Pick[] = [];
  for (const item of raw.picks) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.candidateId !== "string") continue;
    picks.push({
      candidateId: row.candidateId,
      why: typeof row.why === "string" ? row.why : "",
      ...(typeof row.low === "number" ? { low: row.low } : {}),
      ...(typeof row.high === "number" ? { high: row.high } : {}),
      ...(Array.isArray(row.figureIds) ? { figureIds: row.figureIds.filter((id): id is string => typeof id === "string") } : {}),
    });
  }
  return { picks, summary: typeof raw.summary === "string" ? raw.summary : "" };
}

export type SettledTask = { candidate: Candidate; why: string; expectedReturn: ExpectedReturn; evidence: TaskEvidence[]; notes: string[] };

/**
 * What the model chose, as it may be proposed. Decided in code:
 *   - a pick must name a real candidate, once; anything else is dropped;
 *   - a reason that claims a result is replaced by the report's own words;
 *   - numbers stand only when they cite one of the organization's own results figures for the same
 *     organization or client, are a real range, and expect no more than that figure reads today. Then the
 *     basis is "Your data". Anything else is "Not enough data", with no numbers. The proposer never labels
 *     its own guess an inference: it has no source for one.
 */
export function settlePicks(record: PlanRecord, choice: Choice | null): SettledTask[] {
  const out: SettledTask[] = [];
  const seen = new Set<string>();
  const limit = record.weekly ? MAX_WEEKLY : MAX_ON_CHANGE;
  for (const pick of choice?.picks ?? []) {
    if (out.length >= limit) break;
    const candidate = record.candidates.find((row) => row.id === pick.candidateId);
    if (!candidate || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    const notes: string[] = [];
    let why = pick.why.replace(/\s+/g, " ").trim().slice(0, 500);
    if (!why || claimsResult(why)) {
      if (why) notes.push("The reason read as a promise, so the report's own words are used.");
      why = candidate.title;
    }
    const cited = (pick.figureIds ?? []).map((id) => record.figures.find((row) => row.id === id)).filter((row): row is PlanFigure => Boolean(row && row.scope === candidate.scope && row.metric === "conversions"));
    const base = cited[0];
    let expectedReturn: ExpectedReturn = { basis: "insufficient" };
    if (pick.low !== undefined && pick.high !== undefined) {
      if (!base) notes.push("No figure of your own was cited for this, so no numbers are shown.");
      else if (!(pick.low >= 0 && pick.high > pick.low)) notes.push("The estimate was not a range, so no numbers are shown.");
      else if (pick.high > base.value * MAX_GAIN_RATIO) notes.push("The estimate was larger than the figure it rests on, so no numbers are shown.");
      else expectedReturn = { basis: "firstParty", metric: record.metric, period: "month", low: pick.low, high: pick.high };
    }
    const evidence: TaskEvidence[] = [];
    if (candidate.assetId) evidence.push({ kind: "asset", refId: candidate.assetId, label: candidate.assetTitle ?? "The report this comes from" });
    for (const figure of cited.slice(0, 3)) evidence.push({ kind: "figure", label: `${figure.label}: ${figure.display}` });
    out.push({ candidate, why, expectedReturn, evidence, notes });
  }
  return out;
}

/** The summary the model wrote, if it may be shown: short, and claiming nothing. */
export function settleSummary(choice: Choice | null): string {
  const text = (choice?.summary ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
  return text && !claimsResult(text) ? text : "";
}
