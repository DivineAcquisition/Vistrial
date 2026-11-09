import { NO_CONTEXT_WORDS, PROFILE_FIELDS, type ChecksRecord, type CheckResult, type OfferAnalysis, type OfferChange, type OfferContext } from "./shapes";

/**
 * The completion check for an offer analysis. Code decides; no model call says an analysis passed. Every
 * check reads structured fields, never a model's opinion of its own prose.
 */
export type CheckInput = {
  analysis: OfferAnalysis | null;
  context: OfferContext;
  runCostCents: number;
  capCents: number;
};

export const CHECK_NAMES: [number, string][] = [
  [1, "Built on approved research"],
  [2, "States the current offer"],
  [3, "Two or three distinct changes"],
  [4, "Claims point to evidence"],
  [5, "Each change fits this business"],
  [6, "Used the business context"],
  [7, "Within the cost cap"],
];

function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function changeComplete(row: OfferChange) {
  return Boolean(row.title && row.evidence.text && row.fit.text && row.proposedChange && row.validationMethod);
}

export function runChecks(input: CheckInput): ChecksRecord {
  const { analysis, context } = input;
  const results: CheckResult[] = [];
  const add = (id: number, passed: boolean, detail: string) => results.push({ id, name: CHECK_NAMES[id - 1][1], passed, detail });
  if (!analysis) {
    for (const [id] of CHECK_NAMES) add(id, false, "The analysis could not be read.");
    return { passed: false, results };
  }
  const research = new Set(context.researchSources.map((row) => row.id));
  const own = new Set(context.ownSources.map((row) => row.id));
  const known = (id: string) => research.has(id) || own.has(id);
  const reportIds = new Set(context.reports.map((row) => row.assetId));
  const factIds = new Set(context.facts.map((row) => row.id));
  const decisionIds = new Set(context.decisions.map((row) => row.id));
  const hasContext = context.profile !== null || context.facts.length > 0 || context.offerDetails !== "";

  // 1. Every competitor offer comes from the approved research's own sources. None is invented.
  const usedReports = analysis.contextUsed.reportIds;
  const reportsOk = usedReports.length > 0 && usedReports.every((id) => reportIds.has(id));
  const invented = analysis.competitorOffers.filter((row) => row.sourceRefIds.length === 0 || !row.sourceRefIds.every((id) => research.has(id)));
  add(
    1,
    reportsOk && invented.length === 0 && analysis.competitorOffers.length > 0,
    !reportsOk
      ? "The analysis does not name the approved reports it builds on."
      : analysis.competitorOffers.length === 0
        ? "The analysis sets no competitor offer against this one."
        : invented.length === 0
          ? "Every competitor offer cites a source from an approved market report."
          : `${invented.length} competitor offer(s) cite nothing from the approved research.`,
  );

  // 2. What the business sells, at what price, and with what guarantee or terms.
  const offer = analysis.currentOffer;
  const offerOk = Boolean(offer.product && offer.price && offer.guarantee && offer.terms);
  const offerRefsOk = offer.sourceRefIds.every((id) => own.has(id)) && offer.factIds.every((id) => factIds.has(id));
  const offerBasisOk = offer.basis !== "firstParty" || offer.sourceRefIds.length > 0;
  add(
    2,
    offerOk && offerRefsOk && offerBasisOk,
    !offerOk
      ? "The product, price, guarantee or terms are left blank. Write \"Not stated\" where nothing on record says."
      : !offerRefsOk || !offerBasisOk
        ? "The current offer cites data that is not this business's own."
        : "The current offer is stated, with where it comes from.",
  );

  // 3. Two or three changes, each backed by a collected source, each with its own proposed change.
  const backed = analysis.changes.filter((row) => row.evidence.sourceRefIds.some(known)).length;
  const distinct = new Set(analysis.changes.map((row) => norm(row.proposedChange))).size === analysis.changes.length;
  const complete = analysis.changes.every(changeComplete);
  const count = analysis.changes.length;
  add(
    3,
    count >= 2 && count <= 3 && backed === count && distinct && complete,
    count < 2 || backed < count
      ? `Only ${backed} change${backed === 1 ? " is" : "s are"} backed by the approved research or your own data. Two or three are needed.`
      : count > 3
        ? "The analysis proposes more than three changes."
        : !complete
          ? "A change is missing its evidence, fit, proposed change or how to tell if it worked."
          : distinct
            ? `${count} changes, each with its own proposed change.`
            : "Two changes propose the same thing.",
  );

  // 4. Every claim has a basis, and cites only sources it may: research or own data, firstParty only own.
  const claimOk = (basis: string | null, ids: string[]) => {
    if (basis === null) return false;
    if (!ids.every(known)) return false;
    if (basis === "insufficient") return ids.length === 0;
    if (basis === "hypothesis") return true;
    if (basis === "firstParty") return ids.length > 0 && ids.some((id) => own.has(id));
    return ids.length > 0;
  };
  const bad = [
    ...analysis.competitorOffers.filter((row) => !claimOk(row.basis, row.sourceRefIds)),
    ...analysis.gapsAndRisks.filter((row) => !claimOk(row.basis, row.sourceRefIds)),
    ...analysis.changes.filter((row) => !claimOk(row.evidence.basis, row.evidence.sourceRefIds)),
  ].length;
  add(4, bad === 0, bad === 0 ? "Every claim states its basis and cites only collected sources." : `${bad} claim(s) have no basis or cite sources they may not.`);

  // 5. Why each change fits this business: a profile field, a fact or a past outcome on record.
  const fitOk = analysis.changes.every((row) => {
    const fields = row.fit.profileFields.filter((field) => (PROFILE_FIELDS as readonly string[]).includes(field));
    const facts = row.fit.factIds.filter((id) => factIds.has(id));
    const decisions = row.fit.decisionIds.filter((id) => decisionIds.has(id));
    if (row.fit.decisionIds.length !== decisions.length || row.fit.factIds.length !== facts.length) return false;
    if (!hasContext) return norm(row.fit.text).includes(NO_CONTEXT_WORDS);
    return (context.profile !== null && fields.length > 0) || facts.length > 0 || decisions.length > 0;
  });
  add(5, fitOk, fitOk ? "Each change names the business context it fits." : "A change does not say which part of this business it fits, or names context that is not on record.");

  // 6. The context used is listed, real, and not empty when context exists.
  const usedProfileOk = analysis.contextUsed.profileVersionId === null || analysis.contextUsed.profileVersionId === context.profile?.versionId;
  const usedFactsOk = analysis.contextUsed.factIds.every((id) => factIds.has(id));
  const usedSomething = analysis.contextUsed.profileVersionId !== null || analysis.contextUsed.factIds.length > 0;
  const mustUse = context.profile !== null || context.facts.some((row) => row.status === "verified");
  add(
    6,
    usedProfileOk && usedFactsOk && (!mustUse || usedSomething),
    !usedProfileOk || !usedFactsOk
      ? "The analysis lists context that is not on record."
      : mustUse && !usedSomething
        ? "The workspace has business context, but the analysis lists none as used."
        : "The context used is listed.",
  );

  // 7. Cost within the cap.
  add(7, input.runCostCents <= input.capCents, `The run cost ${input.runCostCents.toFixed(2)}¢ of its ${input.capCents}¢ cap.`);

  return { passed: results.every((row) => row.passed), results };
}
