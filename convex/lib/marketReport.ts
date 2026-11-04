import { INSUFFICIENT_PREFIX } from "./evidence";
import type { Basis, Platform, SourceState } from "./researchShapes";

/**
 * Market Intelligence's report (doctrine 3.2 and 3.4): the brief, what was observed, up to three
 * opportunities with five fields each, and the limits. Built in code from the model steps' structured
 * answers; the eight completion checks below read these fields, never the prose.
 */

export const REPORT_DELIVERABLE =
  "Three actionable opportunities, each with its evidence, business relevance, proposed action and validation method.";

export const NO_BUDGET_ASSUMPTION = "Budget not provided; recommendations do not depend on a budget figure.";

/** What an opportunity's relevance says when the workspace has no profile and no facts on record. */
export const NO_CONTEXT = "No business context was on record";

export const TWO_OPPORTUNITIES =
  "Only two opportunities could be supported by the available evidence. Additional research or user input is required.";

/** One thing the brief knows, with where it came from and when. */
export type KnownItem = {
  /** `profile.<field>` or `fact:<id>`. Opportunities cite these keys. */
  key: string;
  label: string;
  value: string;
  origin: "profile" | "fact" | "project";
  status: string;
  recordedAt: number;
};

export type Brief = {
  objective: string;
  deliverables: string[];
  market: string;
  geography: string;
  platforms: Platform[];
  known: { profileVersionId: string | null; profileVersion: number | null; factIds: string[]; verifiedFactIds: string[]; items: KnownItem[] };
  missing: { key: string; blocking: boolean }[];
  assumptions: string[];
};

export type Opportunity = {
  opportunity: string;
  evidence: { basis: Basis; sourceRefIds: string[] };
  businessRelevance: { text: string; contextUsed: string[] };
  proposedAction: string;
  validationMethod: string;
};

export type Observation = { statement: string; basis: Basis; sourceRefIds: string[]; computed?: boolean };

export type Limit = { platform: string; state: SourceState | "skipped"; reasonCode: string; text: string };

export type MarketReport = {
  objective: string;
  brief: Brief;
  /** The profile version and fact ids the report used: `profileVersion:<id>` and `fact:<id>`. */
  contextUsed: string[];
  summary: string;
  observations: Observation[];
  opportunities: Opportunity[];
  /** Required when there are fewer than three opportunities. */
  missingOpportunityReason: string | null;
  limits: Limit[];
};

const BASES: Basis[] = ["observed", "inferred", "hypothesis", "firstParty", "insufficient"];

export function isBasis(value: unknown): value is Basis {
  return typeof value === "string" && (BASES as string[]).includes(value);
}

/* ---------------------------------------------------------------------------
 * Schemas for the model steps. Each has a title the fake provider keys on.
 * ------------------------------------------------------------------------- */

const strings = (maxItems: number) => ({ type: "array", items: { type: "string" }, maxItems });

export const PLAN_SCHEMA = {
  title: "marketPlan",
  type: "object",
  properties: { questions: strings(3), queries: strings(4) },
  required: ["questions", "queries"],
  additionalProperties: false,
};

export const CLASSIFY_SCHEMA = {
  title: "marketClassify",
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sourceRefId: { type: "string" },
          theme: { type: "string" },
          offer: { type: "string" },
          hook: { type: "string" },
        },
        required: ["sourceRefId", "theme", "offer", "hook"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const OPPORTUNITY_ITEM = {
  type: "object",
  properties: {
    opportunity: { type: "string" },
    basis: { type: "string", enum: ["observed", "inferred", "hypothesis", "insufficient"] },
    sourceRefIds: { type: "array", items: { type: "string" } },
    businessRelevance: { type: "string" },
    contextUsed: { type: "array", items: { type: "string" } },
    proposedAction: { type: "string" },
    validationMethod: { type: "string" },
  },
  required: ["opportunity", "basis", "sourceRefIds", "businessRelevance", "contextUsed", "proposedAction", "validationMethod"],
  additionalProperties: false,
};

const OPPORTUNITIES = {
  type: "object",
  properties: {
    opportunities: { type: "array", items: OPPORTUNITY_ITEM, maxItems: 3 },
    missingOpportunityReason: { type: "string" },
  },
  required: ["opportunities", "missingOpportunityReason"],
  additionalProperties: false,
};

export const PRIORITIZE_SCHEMA = { title: "marketPrioritize", ...OPPORTUNITIES };

export const REVISE_SCHEMA = { title: "marketRevise", ...OPPORTUNITIES };

export const WRITE_SCHEMA = {
  title: "marketWrite",
  type: "object",
  properties: {
    summary: { type: "string" },
    observations: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          statement: { type: "string" },
          basis: { type: "string", enum: ["observed", "inferred", "hypothesis", "insufficient"] },
          sourceRefIds: { type: "array", items: { type: "string" } },
        },
        required: ["statement", "basis", "sourceRefIds"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "observations"],
  additionalProperties: false,
};

/* ---------------------------------------------------------------------------
 * Reading model answers. Anything malformed is dropped, never repaired into a claim.
 * ------------------------------------------------------------------------- */

function str(value: unknown, max = 600) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function ids(value: unknown, allowed: ReadonlySet<string>) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && allowed.has(id)))];
}

/**
 * Opportunities from a prioritize or revise answer. Sources must be ones this run's project collected, and
 * context keys must be in the brief. An opportunity whose cited sources are all unknown becomes a hypothesis,
 * so it says it is untested instead of pointing at nothing. Never more than three.
 */
export function readOpportunities(raw: unknown, sourceIds: ReadonlySet<string>, contextKeys: ReadonlySet<string>) {
  const body = (raw ?? {}) as { opportunities?: unknown; missingOpportunityReason?: unknown };
  const rows = Array.isArray(body.opportunities) ? body.opportunities : [];
  const out: Opportunity[] = [];
  for (const row of rows.slice(0, 3)) {
    const item = (row ?? {}) as Record<string, unknown>;
    const refs = ids(item.sourceRefIds, sourceIds);
    let basis: Basis = isBasis(item.basis) && item.basis !== "firstParty" ? item.basis : "hypothesis";
    if ((basis === "observed" || basis === "inferred") && refs.length === 0) basis = "hypothesis";
    out.push({
      opportunity: str(item.opportunity),
      evidence: { basis, sourceRefIds: basis === "insufficient" ? [] : refs },
      businessRelevance: { text: str(item.businessRelevance), contextUsed: ids(item.contextUsed, contextKeys) },
      proposedAction: str(item.proposedAction),
      validationMethod: str(item.validationMethod),
    });
  }
  const reason = str(body.missingOpportunityReason);
  return { opportunities: out, missingOpportunityReason: out.length < 3 ? reason || TWO_OPPORTUNITIES : null };
}

export function readObservations(raw: unknown, sourceIds: ReadonlySet<string>) {
  const body = (raw ?? {}) as { summary?: unknown; observations?: unknown };
  const rows = Array.isArray(body.observations) ? body.observations : [];
  const observations: Observation[] = [];
  for (const row of rows.slice(0, 8)) {
    const item = (row ?? {}) as Record<string, unknown>;
    const statement = str(item.statement);
    if (!statement) continue;
    const refs = ids(item.sourceRefIds, sourceIds);
    let basis: Basis = isBasis(item.basis) && item.basis !== "firstParty" ? item.basis : "hypothesis";
    if ((basis === "observed" || basis === "inferred") && refs.length === 0) basis = "hypothesis";
    if (basis === "insufficient" && !statement.startsWith(INSUFFICIENT_PREFIX)) basis = "hypothesis";
    observations.push({ statement, basis, sourceRefIds: basis === "insufficient" ? [] : refs });
  }
  return { summary: str(body.summary, 1200), observations };
}

const SOURCE_NAMES: Record<string, string> = {
  web: "Web search",
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  metaAdLibrary: "Meta Ad Library",
  "step:plan": "The research plan",
  "step:research": "Web research",
  "step:classify": "Sorting the sources",
  "step:prioritize": "Choosing opportunities",
  "step:write": "Writing the summary",
};

export function sourceName(platform: string) {
  return SOURCE_NAMES[platform] ?? platform;
}

/** Plain words for a source or step that could not be used fully, for the limits section. */
export function limitText(platform: string, state: Limit["state"], reasonCode: string) {
  const label = sourceName(platform);
  if (state === "partial") return `${label} could not show everything (${reasonCode}).`;
  if (state === "awaitingAuthorization") return `${label} is waiting for an account to be approved (${reasonCode}).`;
  if (state === "skipped") return `${label} was not run because the budget could not cover it.`;
  return `${label} could not be used this time (${reasonCode}).`;
}

/** The profile version and fact ids behind the opportunities, as the report lists them. */
export function contextUsedList(brief: Brief, opportunities: Opportunity[]) {
  const used = new Set<string>();
  for (const row of opportunities) {
    for (const key of row.businessRelevance.contextUsed) {
      if (key.startsWith("profile.") && brief.known.profileVersionId) used.add(`profileVersion:${brief.known.profileVersionId}`);
      if (key.startsWith("fact:")) used.add(key);
    }
  }
  return [...used];
}

/** Claims as the evidence rules see them: every observation and every opportunity. */
export function reportClaims(report: Pick<MarketReport, "observations" | "opportunities">) {
  return [
    ...report.observations.map((row, index) => ({
      claimKey: `observation:${index}`,
      statement: row.statement,
      basis: row.basis,
      sourceRefIds: row.sourceRefIds,
      ...(row.computed ? { computed: true } : {}),
    })),
    ...report.opportunities.map((row, index) => ({
      claimKey: `opportunity:${index}`,
      statement: row.opportunity,
      basis: row.evidence.basis,
      sourceRefIds: row.evidence.sourceRefIds,
    })),
  ];
}

/** The person-readable body of a report version. */
export function reportBody(report: MarketReport) {
  const lines = [`Objective: ${report.objective}`, "", report.summary, "", "Opportunities"];
  report.opportunities.forEach((row, index) => {
    lines.push(
      `${index + 1}. ${row.opportunity}`,
      `   Evidence: ${row.evidence.basis}${row.evidence.sourceRefIds.length ? ` (${row.evidence.sourceRefIds.length} sources)` : ""}`,
      `   Business relevance: ${row.businessRelevance.text}`,
      `   Proposed action: ${row.proposedAction}`,
      `   Validation method: ${row.validationMethod}`,
    );
  });
  if (report.missingOpportunityReason) lines.push("", report.missingOpportunityReason);
  if (report.limits.length > 0) lines.push("", "Limits", ...report.limits.map((row) => `- ${row.text}`));
  if (report.brief.assumptions.length > 0) lines.push("", "Assumptions", ...report.brief.assumptions.map((row) => `- ${row}`));
  return lines.join("\n");
}

/* ---------------------------------------------------------------------------
 * The completion check (doctrine 3.4). Checks 4, 6 and 8 need the database; the skill passes their inputs.
 * ------------------------------------------------------------------------- */

export type CheckInputs = {
  /** The brief saved before collection. The report's copy must match it. */
  brief: Brief | null;
  /** Claim keys the evidence rules refused. */
  droppedClaims: string[];
  /** This run's source statuses that were not fully available. */
  notAvailable: { platform: string; state: string }[];
  runCostCents: number;
  runCapCents: number;
};

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function checkReport(report: MarketReport, inputs: CheckInputs) {
  const brief = inputs.brief;
  const knownKeys = new Set(brief?.known.items.map((row) => row.key) ?? []);
  const results: { key: string; passed: boolean; detail: string }[] = [];
  const add = (key: string, passed: boolean, pass: string, fail: string) => results.push({ key, passed, detail: passed ? pass : fail });

  const objectiveMatches = brief !== null && report.objective === brief.objective;
  const relevanceOk = report.opportunities.every((row) =>
    knownKeys.size === 0
      ? row.businessRelevance.text.startsWith(NO_CONTEXT)
      : row.businessRelevance.contextUsed.length > 0 && row.businessRelevance.contextUsed.every((key) => knownKeys.has(key)),
  );
  add(
    "objectiveAndContext",
    objectiveMatches && relevanceOk,
    "The report answers the brief's objective, and each opportunity names the business context it uses.",
    !objectiveMatches
      ? "The report's objective is not the brief's objective."
      : "An opportunity does not name the profile field or fact it relies on.",
  );

  const hasContext = Boolean(brief?.known.profileVersionId) || (brief?.known.verifiedFactIds.length ?? 0) > 0;
  add(
    "contextListed",
    !hasContext || report.contextUsed.length > 0,
    "The report lists the profile version and facts it used.",
    "The workspace has a confirmed profile or verified facts, but the report lists none it used.",
  );

  const actions = report.opportunities.map((row) => normalize(row.proposedAction));
  const distinct = new Set(actions).size === actions.length;
  add(
    "threeOpportunities",
    report.opportunities.length === 3 && distinct,
    "The report has three opportunities with different proposed actions.",
    report.opportunities.length < 3
      ? report.opportunities.length === 2
        ? TWO_OPPORTUNITIES
        : `Only ${report.opportunities.length === 1 ? "one opportunity" : "no opportunities"} could be supported by the available evidence. Additional research or user input is required.`
      : "Two opportunities propose the same action.",
  );

  add(
    "claimsSourced",
    inputs.droppedClaims.length === 0,
    "Every claim points to sources in this workspace or says it is untested.",
    `${inputs.droppedClaims.length} ${inputs.droppedClaims.length === 1 ? "claim does" : "claims do"} not meet the evidence rules.`,
  );

  const claims = reportClaims(report);
  add(
    "claimsHaveBasis",
    claims.every((row) => isBasis(row.basis)),
    "Every claim says whether it was observed, inferred or untested.",
    "A claim does not say whether it was observed, inferred or untested.",
  );

  const named = new Set(report.limits.map((row) => row.platform));
  const unnamed = inputs.notAvailable.filter((row) => !named.has(row.platform));
  add(
    "limitsNamed",
    unnamed.length === 0,
    "Every source that could not be used fully is named in the limits.",
    `The limits do not name ${unnamed.map((row) => sourceName(row.platform)).join(", ")}.`,
  );

  const fieldsOk =
    brief !== null &&
    typeof report.brief.objective === "string" &&
    Array.isArray(report.brief.deliverables) &&
    Array.isArray(report.brief.missing) &&
    Array.isArray(report.brief.assumptions) &&
    Array.isArray(report.limits) &&
    report.opportunities.every(
      (row) => row.opportunity && row.businessRelevance.text && row.proposedAction && row.validationMethod && isBasis(row.evidence.basis),
    ) &&
    (report.opportunities.length === 3 || Boolean(report.missingOpportunityReason));
  add(
    "structure",
    fieldsOk,
    "The report has the brief, the five fields for each opportunity, and its limits.",
    "The report is missing part of the brief, an opportunity field, its limits, or the reason an opportunity is missing.",
  );

  add(
    "withinCap",
    inputs.runCostCents <= inputs.runCapCents,
    "The run stayed within its cost cap.",
    "The run went over its cost cap.",
  );
  return results;
}
