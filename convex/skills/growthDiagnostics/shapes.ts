/**
 * What Growth Diagnostics asks the model for, as JSON schemas, the figures it computes in code, and the
 * defensive readers that turn the model's answer into typed values. A field the model got wrong is dropped
 * or emptied here, never trusted.
 */

export const SKILL_SLUG = "growth-diagnostics";

/** The funnel stages a diagnosis can name, in order. "leads" covers leads and bookings. */
export const STAGES = ["reach", "clicks", "leads", "revenue"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_WORDS: Record<Stage, string> = {
  reach: "Reach",
  clicks: "Clicks",
  leads: "Leads or bookings",
  revenue: "Revenue",
};

/** Step names. The skill finds its own earlier steps by these. "save" matches the session page's. */
export const PHASE = {
  read: "gdRead",
  diagnose: "diagnose",
  check: "gdCheck",
  revise: "gdRevise",
  recheck: "gdRecheck",
  save: "save",
} as const;

/** At most this many prioritised fixes; fewer than the minimum fails the checks. */
export const MIN_FIXES = 2;
export const MAX_FIXES = 3;

/**
 * One number from the business's own data. `computed` is true when code derived it (a rate, a ratio, a
 * change); false when it is a figure as the source reported it. Every figure names the sources it came from.
 */
export type Figure = {
  id: string;
  stage: Stage;
  label: string;
  value: number;
  display: string;
  computed: boolean;
  /** How a computed figure was worked out, in words and the inputs' displays. */
  formula?: string;
  origin: "meta" | "upload" | "decision";
  sourceRefIds: string[];
  period?: string;
};

export type DecisionLine = { id: string; text: string; sourceRefId: string; measured: boolean };

/** What the read step saw and computed, saved as its record. The other steps read it from there. */
export type DiagnosticsRecord = {
  projectId: string;
  hasData: boolean;
  /** Which first-party inputs were found. */
  inputs: { meta: boolean; uploads: number; decisions: number; measuredDecisions: number };
  figures: Figure[];
  /** Stages with at least one figure. */
  stagesWithData: Stage[];
  decisions: DecisionLine[];
  /** What to connect or upload, worded for the owner, one line per missing input or stage. */
  missing: { stage: Stage | "all"; text: string }[];
  profile: null | { versionId: string; offer: string; priceNotes: string; audience: string; geography: string; channels: string };
  facts: { id: string; factKey: string; value: string; status: string }[];
};

const str = { type: "string" };
const strings = { type: "array", items: str };

export const DIAGNOSIS_SCHEMA = {
  type: "object",
  properties: {
    summary: str,
    stage: { type: "string", enum: [...STAGES, "unknown"] },
    stageReason: str,
    stageFigureIds: strings,
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: { statement: str, figureIds: strings },
        required: ["statement", "figureIds"],
        additionalProperties: false,
      },
    },
    fixes: {
      type: "array",
      items: {
        type: "object",
        properties: { fix: str, why: str, figureIds: strings, howToTell: str },
        required: ["fix", "why", "figureIds", "howToTell"],
        additionalProperties: false,
      },
    },
    limits: strings,
  },
  required: ["summary", "stage", "stageReason", "stageFigureIds", "findings", "fixes", "limits"],
  additionalProperties: false,
};

export type Fix = { fix: string; why: string; figureIds: string[]; howToTell: string };

export type Diagnosis = {
  summary: string;
  stage: Stage | "unknown";
  stageReason: string;
  stageFigureIds: string[];
  findings: { statement: string; figureIds: string[] }[];
  fixes: Fix[];
  limits: string[];
};

export type CheckResult = { id: number; name: string; passed: boolean; detail: string };
export type ChecksRecord = { passed: boolean; results: CheckResult[] };

const MAX_TEXT = 1200;

function text(value: unknown, max = MAX_TEXT) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function list(value: unknown, max = 20): string[] {
  return Array.isArray(value) ? value.map((row) => text(row, 200)).filter(Boolean).slice(0, max) : [];
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function readDiagnosis(value: unknown): Diagnosis | null {
  if (!value || typeof value !== "object") return null;
  const row = obj(value);
  const stage = ([...STAGES, "unknown"] as string[]).includes(row.stage as string) ? (row.stage as Diagnosis["stage"]) : "unknown";
  return {
    summary: text(row.summary, 2000),
    stage,
    stageReason: text(row.stageReason),
    stageFigureIds: list(row.stageFigureIds),
    findings: (Array.isArray(row.findings) ? row.findings : []).slice(0, 12).map((item) => ({ statement: text(obj(item).statement), figureIds: list(obj(item).figureIds) })),
    fixes: (Array.isArray(row.fixes) ? row.fixes : []).slice(0, 5).map((item) => {
      const fix = obj(item);
      return { fix: text(fix.fix), why: text(fix.why), figureIds: list(fix.figureIds), howToTell: text(fix.howToTell) };
    }),
    limits: list(row.limits, 10),
  };
}
