/**
 * What Market Intelligence asks the model for, as JSON schemas, and the defensive readers that turn the
 * model's answer into typed values. A field the model got wrong is dropped or emptied here, never trusted.
 */

export const SKILL_SLUG = "market-intelligence";

/** Below this many sources, a pattern reads "Not enough data". */
export const MIN_SAMPLE = 3;

/** Searches the research step may make. Each one brings about 25k tokens into context (2.4). */
export const RESEARCH_SEARCHES = 5;

/** Sources sent to the classify step, newest first. */
export const CLASSIFY_LIMIT = 40;

/** Profile fields an opportunity may name as its business relevance. */
export const PROFILE_FIELDS = ["offer", "priceNotes", "audience", "geography", "channels", "brandVoice", "competitors"] as const;

export const UNCERTAINTY = ["none", "hypothesis", "insufficient"] as const;
export const FINDING_BASIS = ["observed", "inferred", "hypothesis", "firstParty", "insufficient"] as const;

const str = { type: "string" };
const strings = { type: "array", items: str };

export const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    objective: str,
    deliverables: strings,
    researchQuestions: strings,
    searchQueries: strings,
    competitorsToLookUp: strings,
  },
  required: ["objective", "deliverables", "researchQuestions", "searchQueries", "competitorsToLookUp"],
  additionalProperties: false,
};

export const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sourceRefId: str,
          hook: str,
          offer: str,
          callToAction: str,
          format: str,
          audienceHypothesis: str,
          relevance: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["sourceRefId", "hook", "offer", "callToAction", "format", "audienceHypothesis", "relevance"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const opportunity = {
  type: "object",
  properties: {
    opportunity: str,
    evidence: {
      type: "object",
      properties: { sourceRefIds: strings, uncertainty: { type: "string", enum: [...UNCERTAINTY] } },
      required: ["sourceRefIds", "uncertainty"],
      additionalProperties: false,
    },
    businessRelevance: {
      type: "object",
      properties: { text: str, profileFields: strings, factIds: strings },
      required: ["text", "profileFields", "factIds"],
      additionalProperties: false,
    },
    proposedAction: str,
    validationMethod: str,
  },
  required: ["opportunity", "evidence", "businessRelevance", "proposedAction", "validationMethod"],
  additionalProperties: false,
};

export const PRIORITIZE_SCHEMA = {
  type: "object",
  properties: { opportunities: { type: "array", items: opportunity }, missingReason: str },
  required: ["opportunities", "missingReason"],
  additionalProperties: false,
};

export const REPORT_SCHEMA = {
  type: "object",
  properties: {
    objective: str,
    summary: str,
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: { statement: str, basis: { type: "string", enum: [...FINDING_BASIS] }, sourceRefIds: strings },
        required: ["statement", "basis", "sourceRefIds"],
        additionalProperties: false,
      },
    },
    opportunities: { type: "array", items: opportunity },
    limits: {
      type: "array",
      items: { type: "object", properties: { platform: str, text: str }, required: ["platform", "text"], additionalProperties: false },
    },
    contextUsed: {
      type: "object",
      properties: { profileVersionId: { type: ["string", "null"] }, factIds: strings },
      required: ["profileVersionId", "factIds"],
      additionalProperties: false,
    },
    missingOpportunityReason: str,
  },
  required: ["objective", "summary", "findings", "opportunities", "limits", "contextUsed", "missingOpportunityReason"],
  additionalProperties: false,
};

// ---------- Types and readers ----------

export type Opportunity = {
  opportunity: string;
  evidence: { sourceRefIds: string[]; uncertainty: (typeof UNCERTAINTY)[number] };
  businessRelevance: { text: string; profileFields: string[]; factIds: string[] };
  proposedAction: string;
  validationMethod: string;
};

export type Finding = { statement: string; basis: (typeof FINDING_BASIS)[number] | null; sourceRefIds: string[] };

export type Report = {
  objective: string;
  summary: string;
  findings: Finding[];
  opportunities: Opportunity[];
  limits: { platform: string; text: string }[];
  contextUsed: { profileVersionId: string | null; factIds: string[] };
  missingOpportunityReason: string;
};

export type Brief = {
  objective: string;
  deliverables: string[];
  researchQuestions: string[];
  searchQueries: string[];
  competitorsToLookUp: string[];
};

const MAX_TEXT = 2000;

function text(value: unknown, max = MAX_TEXT) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function list(value: unknown, max = 40): string[] {
  return Array.isArray(value) ? value.map((row) => text(row, 300)).filter(Boolean).slice(0, max) : [];
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function parseJson(body: string | undefined | null): unknown {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export function readOpportunity(value: unknown): Opportunity {
  const row = obj(value);
  const evidence = obj(row.evidence);
  const relevance = obj(row.businessRelevance);
  const uncertainty = UNCERTAINTY.includes(evidence.uncertainty as never) ? (evidence.uncertainty as Opportunity["evidence"]["uncertainty"]) : "none";
  return {
    opportunity: text(row.opportunity),
    evidence: { sourceRefIds: list(evidence.sourceRefIds), uncertainty },
    businessRelevance: { text: text(relevance.text), profileFields: list(relevance.profileFields), factIds: list(relevance.factIds) },
    proposedAction: text(row.proposedAction),
    validationMethod: text(row.validationMethod),
  };
}

export function readReport(value: unknown): Report | null {
  if (!value || typeof value !== "object") return null;
  const row = obj(value);
  const used = obj(row.contextUsed);
  return {
    objective: text(row.objective),
    summary: text(row.summary, 4000),
    findings: (Array.isArray(row.findings) ? row.findings : []).slice(0, 40).map((item) => {
      const finding = obj(item);
      return {
        statement: text(finding.statement),
        basis: FINDING_BASIS.includes(finding.basis as never) ? (finding.basis as Finding["basis"]) : null,
        sourceRefIds: list(finding.sourceRefIds),
      };
    }),
    opportunities: (Array.isArray(row.opportunities) ? row.opportunities : []).slice(0, 5).map(readOpportunity),
    limits: (Array.isArray(row.limits) ? row.limits : []).slice(0, 20).map((item) => ({ platform: text(obj(item).platform, 40), text: text(obj(item).text) })),
    contextUsed: { profileVersionId: text(used.profileVersionId, 100) || null, factIds: list(used.factIds) },
    missingOpportunityReason: text(row.missingOpportunityReason),
  };
}

export function readBrief(value: unknown): Brief | null {
  if (!value || typeof value !== "object") return null;
  const row = obj(value);
  // What is known, missing and assumed is built in code (ContextRecord). The model only plans.
  return {
    objective: text(row.objective),
    deliverables: list(row.deliverables),
    researchQuestions: list(row.researchQuestions, 12),
    searchQueries: list(row.searchQueries, 12),
    competitorsToLookUp: list(row.competitorsToLookUp, 12),
  };
}

/** What the context step saw, saved as its record. The other steps read it from there. */
export type ContextRecord = {
  projectId: string;
  objective: string;
  market: string;
  geography: string;
  competitors: { name: string; url?: string }[];
  platforms: string[];
  profile: null | {
    versionId: string;
    offer: string;
    priceNotes: string;
    audience: string;
    geography: string;
    channels: string;
    brandVoice: string;
    competitors: { name: string; url: string }[];
  };
  facts: { id: string; factKey: string; value: string; status: string; sourceType: string; recordedAt: number }[];
  /** Declared gaps that block the run: the question keys still unanswered. */
  gaps: string[];
  /** Built in code, not by the model: what is known, with origin, status and date. */
  known: { key: string; label: string; value: string; origin: "project" | "profile" | "fact" | "connection" | "outcome"; status: string; recordedAt: number }[];
  /** What the brief lacks. A gap that blocks the run is asked; the rest become assumptions. */
  missing: { key: string; blocking: boolean }[];
  assumptions: string[];
};

/** Doctrine 3.3: a missing ad budget does not block research. */
export const NO_BUDGET_ASSUMPTION = "Budget not provided; recommendations do not depend on a budget figure.";

export type ComputeRecord = {
  totals: { sources: number; byPlatform: Record<string, number>; byKind: Record<string, number> };
  patterns: { dimension: "offer" | "callToAction" | "format"; value: string; count: number; sourceRefIds: string[]; enough: boolean }[];
  dates: { earliest: number | null; latest: number | null };
  limits: { platform: string; state: string; reasonCode: string; limitation: string | null }[];
};

export type CheckResult = { id: number; name: string; passed: boolean; detail: string };
export type ChecksRecord = { passed: boolean; results: CheckResult[] };

/** Step names. Skills find their own earlier steps by these. */
export const PHASE = {
  context: "context",
  ask: "ask",
  brief: "brief",
  research: "research",
  collect: "collect",
  classify: "classify",
  apply: "applyClassification",
  compute: "compute",
  prioritize: "prioritize",
  write: "write",
  check: "check",
  revise: "revise",
  recheck: "recheck",
  save: "save",
} as const;

/** The only questions Market Intelligence may ask (doctrine 3.3): no market, or no geography. */
export const QUESTIONS = {
  researchMarket: "Which industry or market should I research?",
  researchGeography: "Which area should I research? For example, a city, region or country.",
} as const;
