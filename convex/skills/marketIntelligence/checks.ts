import { creditWords, priceFor } from "../../lib/credits";
import { PROFILE_FIELDS, type ChecksRecord, type CheckResult, type ComputeRecord, type ContextRecord, type Opportunity, type Report } from "./shapes";

/**
 * The completion check (doctrine 3.4). Code decides; no model call says a report passed. Every check reads
 * structured fields, never a model's opinion of its own prose.
 */
export type CheckInput = {
  report: Report | null;
  context: ContextRecord;
  compute: ComputeRecord | null;
  /** How many opportunities the prioritize step supported. The write step may not add one. */
  prioritizedCount: number;
  /** The source references that exist in this workspace's project. */
  knownSourceIds: Set<string>;
  runCostCents: number;
  capCents: number;
};

function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function oppComplete(row: Opportunity) {
  return Boolean(row.opportunity && row.businessRelevance.text && row.proposedAction && row.validationMethod);
}

export const NO_CONTEXT_WORDS = "no business context";

export function runChecks(input: CheckInput): ChecksRecord {
  const { report, context } = input;
  const results: CheckResult[] = [];
  const add = (id: number, name: string, passed: boolean, detail: string) => results.push({ id, name, passed, detail });
  if (!report) {
    for (const [id, name] of CHECK_NAMES) add(id, name, false, "The report could not be read.");
    return { passed: false, results };
  }
  const factIds = new Set(context.facts.map((row) => row.id));
  const verifiedFacts = context.facts.filter((row) => row.status === "verified");
  const hasContext = context.profile !== null || context.facts.length > 0;

  // 1. Objective and business relevance.
  const objectiveMatches = norm(report.objective) === norm(context.objective);
  const relevanceOk = report.opportunities.every((row) => {
    const fields = row.businessRelevance.profileFields.filter((field) => (PROFILE_FIELDS as readonly string[]).includes(field));
    const facts = row.businessRelevance.factIds.filter((id) => factIds.has(id));
    if (!hasContext) return norm(row.businessRelevance.text).includes(NO_CONTEXT_WORDS);
    return (context.profile !== null && fields.length > 0) || facts.length > 0;
  });
  add(
    1,
    CHECK_NAMES[0][1],
    objectiveMatches && relevanceOk,
    !objectiveMatches
      ? "The report's objective is not the assignment's objective."
      : relevanceOk
        ? "The objective matches, and each opportunity names the business context it uses."
        : "An opportunity does not say which profile field or business fact it is relevant to.",
  );

  // 2. Context used is listed, real, and not empty when context exists.
  const usedProfileOk = report.contextUsed.profileVersionId === null || report.contextUsed.profileVersionId === context.profile?.versionId;
  const usedFactsOk = report.contextUsed.factIds.every((id) => factIds.has(id));
  const usedSomething = report.contextUsed.profileVersionId !== null || report.contextUsed.factIds.length > 0;
  const mustUse = context.profile !== null || verifiedFacts.length > 0;
  add(
    2,
    CHECK_NAMES[1][1],
    usedProfileOk && usedFactsOk && (!mustUse || usedSomething),
    !usedProfileOk || !usedFactsOk
      ? "The report lists context that is not on record."
      : mustUse && !usedSomething
        ? "The workspace has business context, but the report lists none as used."
        : "The context used is listed.",
  );

  // 3. Three opportunities with different proposed actions.
  // Evidence-backed means citing at least one collected source. An opportunity that cites none (labelled
  // not enough evidence, or a hypothesis with nothing behind it) does not count toward the three.
  const actions = new Set(report.opportunities.map((row) => norm(row.proposedAction)));
  const backed = report.opportunities.filter((row) => row.evidence.sourceRefIds.some((id) => input.knownSourceIds.has(id))).length;
  const three = report.opportunities.length === 3 && backed === 3;
  const distinct = actions.size === report.opportunities.length;
  add(
    3,
    CHECK_NAMES[2][1],
    three && distinct,
    !three
      ? backed < 3 && report.opportunities.length <= 3
        ? `Only ${backed} opportunit${backed === 1 ? "y" : "ies"} could be supported by the available evidence.${report.missingOpportunityReason ? ` ${report.missingOpportunityReason}` : " The report does not say why."} Additional research or user input is required.`
        : "The report has more than three opportunities."
      : distinct
        ? "Three opportunities, each with its own action."
        : "Two opportunities propose the same action.",
  );

  // 4. Material claims cite real sources, or carry an explicit uncertainty label.
  const findingOk = (ids: string[]) => ids.length > 0 && ids.every((id) => input.knownSourceIds.has(id));
  const badFindings = report.findings.filter((row) => {
    if (row.basis === "hypothesis" || row.basis === "insufficient") return row.sourceRefIds.some((id) => !input.knownSourceIds.has(id));
    return !findingOk(row.sourceRefIds);
  });
  const badOpps = report.opportunities.filter((row) =>
    row.evidence.uncertainty === "none" ? !findingOk(row.evidence.sourceRefIds) : row.evidence.sourceRefIds.some((id) => !input.knownSourceIds.has(id)),
  );
  add(
    4,
    CHECK_NAMES[3][1],
    badFindings.length === 0 && badOpps.length === 0,
    badFindings.length + badOpps.length === 0
      ? "Every material claim cites a collected source or says it is uncertain."
      : `${badFindings.length + badOpps.length} claim(s) cite no collected source and carry no uncertainty label.`,
  );

  // 5. Every claim has a basis.
  const unbased = report.findings.filter((row) => row.basis === null).length;
  add(5, CHECK_NAMES[4][1], unbased === 0, unbased === 0 ? "Every finding states its basis." : `${unbased} finding(s) state no basis.`);

  // 6. Every source that was not fully available is named in the limits.
  const named = new Set(report.limits.map((row) => norm(row.platform)));
  const unavailable = (input.compute?.limits ?? []).filter((row) => row.state !== "available");
  const unnamed = unavailable.filter((row) => !named.has(norm(row.platform)));
  add(
    6,
    CHECK_NAMES[5][1],
    unnamed.length === 0,
    unnamed.length === 0 ? "Every limited source is named in the limits." : `The limits leave out: ${unnamed.map((row) => row.platform).join(", ")}.`,
  );

  // 7. Structure: the brief's fields, the five opportunity fields, the limits, and nothing added.
  const structureOk =
    Boolean(report.objective && report.summary) &&
    report.opportunities.every(oppComplete) &&
    Array.isArray(report.limits) &&
    report.opportunities.length <= input.prioritizedCount;
  add(
    7,
    CHECK_NAMES[6][1],
    structureOk,
    structureOk
      ? "The report has every required section."
      : report.opportunities.length > input.prioritizedCount
        ? "The report adds an opportunity the evidence step did not support."
        : "A required section or opportunity field is empty.",
  );

  // 8. Cost within the cap.
  add(8, CHECK_NAMES[7][1], input.runCostCents <= input.capCents, `The run used ${creditWords(priceFor(input.runCostCents))} of its ${creditWords(priceFor(input.capCents))} limit.`);

  return { passed: results.every((row) => row.passed), results };
}

export const CHECK_NAMES: [number, string][] = [
  [1, "Understood the objective"],
  [2, "Used the business context"],
  [3, "Three distinct opportunities"],
  [4, "Claims point to evidence"],
  [5, "Every claim has a basis"],
  [6, "Limits are named"],
  [7, "Required structure"],
  [8, "Within the cost cap"],
];
