/**
 * The completion checks for a proposal, in code. No model call says a proposal passed. docs/rebuild/dealmaker.md,
 * 4.5: it never sets or changes a price, and a price not in the offer is refused.
 */

import { claimsResult } from "../../lib/agentTasks";
import { PERSONAL, PRESSURE, moneyIn, quoted } from "../dealBriefing/checks";
import { PROPOSAL_LIMITS, type ChecksRecord, type CheckResult, type Proposal, type ProposalRecord } from "./shapes";

export const CHECK_NAMES = [
  [1, "Every need rests on a quote from the call review"],
  [2, "The package is in the Offer folder"],
  [3, "The price is the Offer folder's, and no other amount appears"],
  [4, "Each deliverable is in the package's own words"],
  [5, "No promised result; every figure comes from an offer item named"],
  [6, "No pressure and nothing guessed about the lead as a person"],
  [7, "Short and complete"],
] as const;

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
const MONEY_TEXT = /(?:[$£€]\s?\d[\d,]*(?:\.\d+)?\s?[kK]?|\b\d[\d,]*(?:\.\d+)?\s?[kK]?\s?(?:USD|EUR|GBP|CAD|AUD|dollars|pounds|euros)\b)/g;

/** Figures that are not money: "41 booked consultations", "12 weeks". */
export function figuresIn(text: string) {
  return [...text.replace(MONEY_TEXT, " ").matchAll(/\d[\d,.]*/g)].map((match) => match[0].replace(/[,.]+$/, "").replace(/,/g, ""));
}

/** Everything the proposal writes in its own words (the offer items' words are copied in code, not written). */
export function writtenText(draft: Proposal) {
  return [draft.title, draft.intro, ...draft.needs.map((row) => row.need), ...draft.deliverables, ...draft.nextSteps, draft.closing].join("\n");
}

export function runChecks(draft: Proposal | null, record: ProposalRecord): ChecksRecord {
  const results: CheckResult[] = [];
  const add = (id: number, passed: boolean, detail: string) => results.push({ id, name: CHECK_NAMES.find((row) => row[0] === id)![1], passed, detail });
  if (!draft) {
    for (const [id] of CHECK_NAMES) add(id, false, "No proposal was written.");
    return { passed: false, results };
  }
  const quotes = new Map(record.quotes.map((row) => [row.id, row]));
  const offer = new Map(record.offer.map((row) => [row.id, row]));
  const named = [draft.packageId, draft.priceId, draft.guaranteeId, ...draft.proofIds].map((id) => offer.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));

  // 1. Needs stand on quotes from the review.
  const bare = draft.needs.filter((row) => !quotes.has(row.quoteId));
  add(1, draft.needs.length > 0 && bare.length === 0, draft.needs.length === 0 ? "Names none of the lead's needs." : bare.length ? `${bare.length} need(s) cite no quote from the call review.` : `${draft.needs.length} need(s), each with its quote.`);

  // 2. The package.
  const pkg = offer.get(draft.packageId);
  add(2, pkg?.kind === "package", pkg?.kind === "package" ? `The package: ${pkg.title}.` : "The package named is not in the Offer folder.");

  // 3. The price is an Offer price item; no amount anywhere that the Offer folder does not state.
  const price = offer.get(draft.priceId);
  const allowed = new Set(record.offer.flatMap((row) => moneyIn(`${row.title} ${row.body}`)));
  const stray = moneyIn(writtenText(draft)).filter((value) => !allowed.has(value));
  add(3, price?.kind === "price" && stray.length === 0, price?.kind !== "price" ? "The price named is not one the Offer folder allows in proposals." : stray.length ? `Names amounts the Offer folder does not state: ${stray.slice(0, 3).join(", ")}.` : `The price as the Offer folder states it: ${price.title}.`);

  // 4. Deliverables in the package's own words.
  const source = pkg ? `${pkg.title} ${pkg.body}` : "";
  const invented = draft.deliverables.filter((row) => !quoted(row, source));
  add(4, draft.deliverables.length > 0 && invented.length === 0, draft.deliverables.length === 0 ? "Lists no deliverables." : invented.length ? `Not in the package's words: ${invented.slice(0, 2).map((row) => `"${row.slice(0, 50)}"`).join(", ")}.` : `${draft.deliverables.length} deliverable(s), copied from the package.`);

  // 5. No promise; figures only from the offer items named.
  const text = writtenText(draft);
  const known = new Set(named.flatMap((item) => figuresIn(`${item.title} ${item.body}`)));
  const ungrounded = figuresIn(text).filter((figure) => !known.has(figure));
  const guarantee = draft.guaranteeId ? offer.get(draft.guaranteeId) : null;
  const badRefs = (draft.guaranteeId && guarantee?.kind !== "guarantee") || draft.proofIds.some((id) => offer.get(id)?.kind !== "proof");
  add(5, !claimsResult(text) && ungrounded.length === 0 && !badRefs, claimsResult(text) ? "Reads as a promise of a result." : ungrounded.length ? `Figures not found in the offer items named: ${[...new Set(ungrounded)].slice(0, 3).join(", ")}.` : badRefs ? "Names a guarantee or proof that is not in the Offer folder." : "Promises nothing; every figure is from an offer item named.");

  // 6. No pressure; nothing personal the review's quotes do not hold.
  const personal = text.match(PERSONAL);
  const personalOk = !personal || record.quotes.some((row) => quoted(personal[0], row.quote));
  add(6, !PRESSURE.test(text) && personalOk, PRESSURE.test(text) ? "Invents urgency." : !personalOk ? "Guesses about the lead as a person." : "No pressure and nothing personal.");

  // 7. Short and complete.
  const problem = !draft.title
    ? "Has no title."
    : words(draft.intro) > PROPOSAL_LIMITS.introWords || !draft.intro
      ? `The opening is empty or longer than ${PROPOSAL_LIMITS.introWords} words.`
      : words(draft.closing) > PROPOSAL_LIMITS.closingWords
        ? `The closing is longer than ${PROPOSAL_LIMITS.closingWords} words.`
        : draft.needs.length > PROPOSAL_LIMITS.needs || draft.deliverables.length > PROPOSAL_LIMITS.deliverables || draft.nextSteps.length > PROPOSAL_LIMITS.nextSteps
          ? "Too many needs, deliverables or next steps."
          : draft.nextSteps.length === 0
            ? "Says no next step."
            : null;
  add(7, problem === null, problem ?? "Short, with a next step.");

  return { passed: results.every((row) => row.passed), results };
}
