/**
 * The task proposer's shapes and the rules that need no database. The proposer never invents a task: it
 * chooses among candidates that already exist as items of the organization's own approved reports, and
 * code decides what an expected return may say: "Your data" from its own results, "Inference" from the
 * market sources its reports cite, or "Not enough data".
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
/** The most market sources one candidate carries to the model, and the most a card links. */
export const MAX_SOURCES_PER_CANDIDATE = 4;
/**
 * An estimate that rests on market sources, not on the organization's own results, must be a wide range:
 * its high end at least this many times its low end. A narrow one reads as a single confident figure.
 */
export const INFERENCE_MIN_SPREAD = 1.5;

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
  /** The market sources the report cited for this item (ids of PlanSource). Only these can support an inference. */
  sourceIds?: string[];
  /** How sure the report itself was of this item. */
  uncertainty?: string;
};

/** One market source saved on an approved report: what was read, where, and when. */
export type PlanSource = { id: string; refId: string; scope: string; title: string; publisher: string | null; date: string; excerpt: string | null; limitation: string | null };

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
  /** Market sources cited by the candidates' reports. Missing on a plan read before inference existed. */
  sources?: PlanSource[];
  /** The owner's goal as a number of `metric` a month, when their words name one. The ceiling of an inference. */
  monthlyTarget?: number | null;
  finished: string[];
  due: string[];
};

export type Pick = { candidateId: string; why: string; low?: number; high?: number; figureIds?: string[]; sourceIds?: string[] };
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
        properties: { candidateId: { type: "string" }, why: { type: "string" }, low: { type: "number" }, high: { type: "number" }, figureIds: { type: "array", items: { type: "string" } }, sourceIds: { type: "array", items: { type: "string" } } },
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
      ...(Array.isArray(row.sourceIds) ? { sourceIds: row.sourceIds.filter((id): id is string => typeof id === "string") } : {}),
    });
  }
  return { picks, summary: typeof raw.summary === "string" ? raw.summary : "" };
}

export type SettledTask = { candidate: Candidate; why: string; expectedReturn: ExpectedReturn; evidence: TaskEvidence[]; notes: string[] };

/** How a market source reads on a card. A title that reads as a promise is not repeated. */
export function sourceLabel(source: PlanSource): string {
  const by = source.publisher ? `${source.publisher}, ${source.date}` : source.date;
  const title = source.title.replace(/\s+/g, " ").trim().slice(0, 120);
  return title && !claimsResult(title) ? `${title} (${by})` : `A source the report cites (${by})`;
}

/**
 * What the model chose, as it may be proposed. Decided in code:
 *   - a pick must name a real candidate, once; anything else is dropped;
 *   - a reason that claims a result is replaced by the report's own words;
 *   - numbers must be a real range, and rest on something:
 *       "Your data": where the same organization or client has a results figure of its own, the range
 *       must cite it and expect no more than it reads today. Market sources cannot stand in for it.
 *       "Inference": only where there is no such figure. The range must cite at least one market source
 *       that the report itself cited for this very item, be wide (INFERENCE_MIN_SPREAD), and expect no more
 *       a month than the owner's own stated goal. With no goal number there is nothing to size it against.
 *     Anything else is "Not enough data", with no numbers. The two bases are never mixed in one range.
 */
export function settlePicks(record: PlanRecord, choice: Choice | null): SettledTask[] {
  const out: SettledTask[] = [];
  const seen = new Set<string>();
  const limit = record.weekly ? MAX_WEEKLY : MAX_ON_CHANGE;
  const sources = record.sources ?? [];
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
    const hasOwnFigure = record.figures.some((row) => row.scope === candidate.scope && row.metric === "conversions");
    const allowed = new Set(candidate.sourceIds ?? []);
    const citedSources = [...new Set(pick.sourceIds ?? [])]
      .filter((id) => allowed.has(id))
      .map((id) => sources.find((row) => row.id === id))
      .filter((row): row is PlanSource => Boolean(row && row.scope === candidate.scope))
      .slice(0, MAX_SOURCES_PER_CANDIDATE);
    const target = record.monthlyTarget ?? null;
    let expectedReturn: ExpectedReturn = { basis: "insufficient" };
    if (pick.low !== undefined && pick.high !== undefined) {
      const { low, high } = pick;
      if (!(low >= 0 && high > low)) notes.push("The estimate was not a range, so no numbers are shown.");
      else if (hasOwnFigure) {
        if (!base) notes.push("No figure of your own was cited for this, so no numbers are shown.");
        else if (high > base.value * MAX_GAIN_RATIO) notes.push("The estimate was larger than the figure it rests on, so no numbers are shown.");
        else expectedReturn = { basis: "firstParty", metric: record.metric, period: "month", low, high };
      } else if (citedSources.length === 0) notes.push("No figure of your own and no source the report cites for this stood behind the estimate, so no numbers are shown.");
      else if (target === null || !(target > 0)) notes.push("Your goal names no number to size an estimate against, so no numbers are shown.");
      else if (high > target) notes.push("The estimate was larger than your whole goal, so no numbers are shown.");
      else if (high < low * INFERENCE_MIN_SPREAD) notes.push("The estimate was too narrow for one that rests on market sources, so no numbers are shown.");
      else expectedReturn = { basis: "inferred", metric: record.metric, period: "month", low, high };
    }
    const evidence: TaskEvidence[] = [];
    if (candidate.assetId) evidence.push({ kind: "asset", refId: candidate.assetId, label: candidate.assetTitle ?? "The report this comes from" });
    // What a number rests on is listed alone: figures for "Your data", sources for "Inference".
    if (expectedReturn.basis !== "inferred") for (const figure of cited.slice(0, 3)) evidence.push({ kind: "figure", label: `${figure.label}: ${figure.display}` });
    if (expectedReturn.basis !== "firstParty") for (const source of citedSources) evidence.push({ kind: "sourceRef", refId: source.refId, label: sourceLabel(source) });
    out.push({ candidate, why, expectedReturn, evidence, notes });
  }
  return out;
}

/** The summary the model wrote, if it may be shown: short, and claiming nothing. */
export function settleSummary(choice: Choice | null): string {
  const text = (choice?.summary ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
  return text && !claimsResult(text) ? text : "";
}
