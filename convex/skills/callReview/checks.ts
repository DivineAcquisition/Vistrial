/**
 * The completion checks for a call review, in code (docs/rebuild/dealmaker.md, 4.2). No model says a review
 * passed: each check reads the structured answer against the sources and the CRM.
 */

import { claimsResult } from "../../lib/agentTasks";
import { moneyIn, PERSONAL, quoted } from "../dealBriefing/checks";
import { REVIEW_LIMITS, type ChecksRecord, type CheckResult, type Review, type ReviewRecord } from "./shapes";

export const CHECK_NAMES = [
  [1, "Every quote is the source's own words"],
  [2, "Every objection and commitment carries its quote"],
  [3, "A proposed stage is in this deal's pipeline"],
  [4, "Won or lost only on the buyer's own yes or no"],
  [5, "Commitment dates are real dates on or after the call"],
  [6, "The recap promises nothing, prices nothing new, and is short"],
  [7, "At most three coaching notes, about the call, not the person"],
] as const;

const PRESSURE = /\b(act (now|fast)|limited[- ]time|only \d+ (spots?|places?|seats?) left|before it'?s gone|last chance|price (goes|will go) up|expires? (today|tonight|soon))\b/i;
/** A verdict about a person, not about the call (doctrine V). */
const VERDICT = /\b(lazy|incompetent|useless|bad at (sales|selling|their job)|not cut out|terrible (closer|salesperson)|should be (fired|replaced))\b/i;

export function words(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

/** A due date the review gave: YYYY-MM-DD, on or after the call. Empty means none, which is fine. */
export function dueOf(due: string, callDate: string | null): number | null | "bad" {
  if (!due) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return "bad";
  const at = Date.parse(`${due}T17:00:00Z`);
  if (!Number.isFinite(at)) return "bad";
  if (callDate && due < callDate) return "bad";
  return at;
}

export function runChecks(review: Review | null, record: ReviewRecord): ChecksRecord {
  const results: CheckResult[] = [];
  const add = (id: number, passed: boolean, detail: string) => results.push({ id, name: CHECK_NAMES[id - 1][1], passed, detail });
  if (!review) {
    for (const [id] of CHECK_NAMES) add(id, false, "The review could not be read.");
    return { passed: false, results };
  }
  const sources = new Map(record.sources.map((row) => [row.id, row]));
  const found = (quote: string, sourceId: string) => {
    const source = sources.get(sourceId);
    return Boolean(source) && quoted(quote, source!.text);
  };
  const call = record.sources.find((row) => row.type === "call");

  // 1. Every quote is found in the source it cites (the answer to an objection, in the call).
  const items = new Set(record.playbook.map((row) => row.id));
  const bad = [
    ...review.fit.filter((row) => !found(row.quote, row.sourceId)).map((row) => row.quote),
    ...review.objections.filter((row) => row.quote && !found(row.quote, row.sourceId)).map((row) => row.quote),
    ...review.objections.filter((row) => row.answered && row.answerQuote && !(call && quoted(row.answerQuote, call.text))).map((row) => row.answerQuote),
    ...review.commitments.filter((row) => row.quote && !found(row.quote, row.sourceId)).map((row) => row.quote),
    ...review.coverage.filter((row) => !items.has(row.itemId) || !(call && quoted(row.quote, call.text))).map((row) => row.quote),
  ];
  add(1, bad.length === 0, bad.length === 0 ? "Every quote is in the source it cites." : `${bad.length} quote(s) are not in their source: "${bad[0].slice(0, 60)}".`);

  // 2. No objection or commitment without its quote.
  const bare = [...review.objections.filter((row) => !row.quote), ...review.commitments.filter((row) => !row.quote || !row.what)];
  const tooMany = review.objections.length > REVIEW_LIMITS.objections || review.commitments.length > REVIEW_LIMITS.commitments;
  add(2, bare.length === 0 && !tooMany, tooMany ? "Too many objections or commitments for one call." : bare.length ? `${bare.length} objection(s) or commitment(s) carry no quote.` : "Each objection and commitment has its quote.");

  // 3. A stage move only within this deal's pipeline, and only with a deal.
  const stageRef = review.stage.stageRef;
  const stageOk = !stageRef || (record.deal !== null && record.stages.some((row) => row.ref === stageRef));
  add(3, stageOk, stageOk ? (stageRef ? "The stage is in this deal's pipeline." : "Proposes no stage move.") : `"${stageRef}" is not a stage of this deal's pipeline.`);

  // 4. Won or lost only when the buyer said yes or no on the call itself.
  const decisionOk = !review.decision.status || (record.deal !== null && Boolean(call) && quoted(review.decision.quote, call!.text));
  add(4, decisionOk, decisionOk ? (review.decision.status ? `Proposes ${review.decision.status} on the buyer's own words.` : "Proposes no win or loss.") : "A win or a loss needs the buyer's own yes or no, quoted from the call.");

  // 5. Dates are real and not before the call.
  const badDates = review.commitments.filter((row) => dueOf(row.due, record.callDate) === "bad");
  add(5, badDates.length === 0, badDates.length === 0 ? "Every date is a real date on or after the call." : `${badDates.length} commitment date(s) are not real dates on or after the call (use YYYY-MM-DD).`);

  // 6. The recap: short, no promise, no pressure, no price the offer and the CRM do not state, nothing personal.
  const recap = `${review.recap.subject} ${review.recap.body}`;
  const allowed = new Set(record.playbook.filter((row) => row.folder === "offer").flatMap((row) => moneyIn(`${row.title} ${row.body}`)).concat(record.deal ? [record.deal.value] : []));
  const prices = moneyIn(recap).filter((value) => !allowed.has(value));
  const recapProblem = !review.recap.body
    ? "The recap is empty."
    : words(review.recap.body) > REVIEW_LIMITS.recapWords
      ? `The recap is longer than ${REVIEW_LIMITS.recapWords} words.`
      : claimsResult(recap)
        ? "The recap reads as a promise of a result."
        : PRESSURE.test(recap)
          ? "The recap invents urgency."
          : prices.length
            ? `The recap names amounts the offer does not state: ${prices.slice(0, 3).join(", ")}.`
            : PERSONAL.test(recap) && !record.sources.some((row) => quoted(recap.match(PERSONAL)![0], row.text))
              ? "The recap guesses about the lead as a person."
              : null;
  add(6, recapProblem === null, recapProblem ?? "A short recap that promises nothing and invents nothing.");

  // 7. Coaching: at most three notes, about the call.
  const verdict = review.coaching.find((row) => VERDICT.test(row));
  const coachingOk = review.coaching.length <= REVIEW_LIMITS.coaching && !verdict;
  add(7, coachingOk, coachingOk ? `${review.coaching.length} coaching note(s), about the call.` : verdict ? `A coaching note judges the person: "${verdict.slice(0, 60)}".` : `At most ${REVIEW_LIMITS.coaching} coaching notes.`);

  return { passed: results.every((row) => row.passed), results };
}
