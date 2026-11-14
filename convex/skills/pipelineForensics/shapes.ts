/**
 * What Pipeline Forensics computes in code, what it asks the model for, and the defensive reader that turns
 * the model's answer into typed values. docs/rebuild/dealmaker.md, section 4.1.
 */

export const SKILL_SLUG = "pipeline-forensics";
export const AGENT_SLUG = "sales-conversion";

/** Step names. The skill finds its own earlier steps by these. "save" matches the session page's. */
export const PHASE = {
  read: "pfRead",
  review: "review",
  check: "pfCheck",
  revise: "pfRevise",
  recheck: "pfRecheck",
  save: "save",
} as const;

/** The window the review reads, in days, and the default number of quiet days that makes a deal stalled. */
export const WINDOW_DAYS = 90;
export const STALLED_DAYS = 14;
/** The settings a business may choose for "stalled" (owner's answer 12.5). */
export const STALLED_CHOICES = [7, 14, 21, 30] as const;

/** Fewer deals than this in the pipeline and the review says "Not enough data" without calling a model. */
export const MIN_DEALS = 20;
/** A rate or a median is worked out only from at least this many cases; below it, no figure is made. */
export const MIN_SAMPLE = 5;

/** Steps in the plan: at most five, Fix first. */
export const MAX_STEPS = 5;
export const PLAN_PHASES = ["fix", "build", "scale"] as const;
export type PlanPhase = (typeof PLAN_PHASES)[number];
export const PLAN_WORDS: Record<PlanPhase, string> = { fix: "Fix", build: "Build", scale: "Scale" };

export const NOT_ENOUGH_DATA = "Not enough data";

/**
 * One number from the business's own CRM. `computed` is true when code worked it out (a rate, a median, a
 * sum); false when it is a count of rows as read. Every figure cites the CRM source saved on the project.
 */
export type Figure = {
  id: string;
  label: string;
  value: number;
  display: string;
  computed: boolean;
  formula?: string;
  /** The stage it is about, when it is about one. */
  stageRef?: string;
  period?: string;
  sourceRefIds: string[];
};

/** One stage of the pipeline under review, in pipeline order. Counts are of deals in this pipeline. */
export type StageFlow = {
  ref: string;
  name: string;
  order: number;
  /** Open deals in the stage now, and their value. */
  open: number;
  openValue: number;
  /** Open deals with no activity and no stage change for the stalled-deal days. */
  stalled: number;
  stalledValue: number;
  /** The middle of how long open deals have been in this stage, in whole days; null below the sample. */
  medianDays: number | null;
  /** Deals that moved on from this stage in the window, as the CRM's stage changes record it. */
  movedOn: number;
};

/** What the read step saw and computed, saved as its record. The other steps read it from there. */
export type ForensicsRecord = {
  projectId: string;
  hasData: boolean;
  crm: { label: string; accountName: string; currency: string } | null;
  pipeline: { ref: string; name: string } | null;
  /** Other pipelines in the CRM, not reviewed this time. */
  otherPipelines: number;
  windowDays: number;
  stalledDays: number;
  stages: StageFlow[];
  /** The stage where the most deals stop moving, decided in code; null when no stage stands out. */
  stall: { stageRef: string; name: string; why: "stalled" | "slowest" } | null;
  figures: Figure[];
  /** What the review could not read or work out, worded for the owner. */
  missing: string[];
};

const str = { type: "string" };
const strings = { type: "array", items: str };

export const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    summary: str,
    stallReason: str,
    stallFigureIds: strings,
    findings: {
      type: "array",
      items: { type: "object", properties: { statement: str, figureIds: strings }, required: ["statement", "figureIds"], additionalProperties: false },
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: { phase: { type: "string", enum: [...PLAN_PHASES] }, problem: str, figureIds: strings, action: str, targetMetric: str, target: str },
        required: ["phase", "problem", "figureIds", "action", "targetMetric", "target"],
        additionalProperties: false,
      },
    },
    limits: strings,
  },
  required: ["summary", "stallReason", "stallFigureIds", "findings", "steps", "limits"],
  additionalProperties: false,
};

export type PlanStep = { phase: PlanPhase; problem: string; figureIds: string[]; action: string; targetMetric: string; target: string };

export type Review = {
  summary: string;
  stallReason: string;
  stallFigureIds: string[];
  findings: { statement: string; figureIds: string[] }[];
  steps: PlanStep[];
  limits: string[];
};

export type CheckResult = { id: number; name: string; passed: boolean; detail: string };
export type ChecksRecord = { passed: boolean; results: CheckResult[] };

function text(value: unknown, max = 1200) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function list(value: unknown, max = 20): string[] {
  return Array.isArray(value) ? value.map((row) => text(row, 200)).filter(Boolean).slice(0, max) : [];
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** The model's answer, read defensively: a field it got wrong is dropped or emptied, never trusted. */
export function readReview(value: unknown): Review | null {
  if (!value || typeof value !== "object") return null;
  const row = obj(value);
  return {
    summary: text(row.summary, 2000),
    stallReason: text(row.stallReason),
    stallFigureIds: list(row.stallFigureIds),
    findings: (Array.isArray(row.findings) ? row.findings : []).slice(0, 8).map((item) => ({ statement: text(obj(item).statement), figureIds: list(obj(item).figureIds) })),
    steps: (Array.isArray(row.steps) ? row.steps : [])
      .map((item) => {
        const step = obj(item);
        const phase = PLAN_PHASES.includes(step.phase as PlanPhase) ? (step.phase as PlanPhase) : null;
        return phase ? { phase, problem: text(step.problem), figureIds: list(step.figureIds), action: text(step.action), targetMetric: text(step.targetMetric, 200), target: text(step.target, 400) } : null;
      })
      .filter((step): step is PlanStep => step !== null)
      .sort((a, b) => PLAN_PHASES.indexOf(a.phase) - PLAN_PHASES.indexOf(b.phase))
      .slice(0, MAX_STEPS),
    limits: list(row.limits, 10),
  };
}
