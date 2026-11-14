/**
 * The completion checks for a pipeline review, in code. No model call says a review passed: each check reads
 * the structured answer against the figures computed in code. docs/rebuild/dealmaker.md, section 4.1.
 */

import { claimsResult } from "../../lib/agentTasks";
import { numbersIn } from "../growthDiagnostics/checks";
import { MAX_STEPS, NOT_ENOUGH_DATA, type ChecksRecord, type CheckResult, type Figure, type ForensicsRecord, type Review } from "./shapes";

export const CHECK_NAMES = [
  [1, "The stall has the CRM's own figures behind it"],
  [2, "Every finding cites the CRM's own figures"],
  [3, "Every number comes from a figure"],
  [4, "No outside benchmarks"],
  [5, "Promises no result"],
  [6, "A short plan, Fix first, each step grounded or marked Not enough data"],
] as const;

/** Words that compare against figures Vistrial cannot source. */
const BENCHMARK = /\b(industry|benchmarks?|on average|average (for|in|across)|typical(ly)? (for|in|of) (agencies|coaches|businesses|companies|consultants)|healthy (rate|range)|norm(al)? (for|in))\b/i;

/** Counts small enough to be words in a sentence ("two stages", "3 steps"). */
const SMALL = 10;

function figureNumbers(figures: Figure[]) {
  const out = new Set<number>();
  for (const row of figures) for (const value of numbersIn(`${row.display} ${row.formula ?? ""} ${row.period ?? ""} ${row.label}`)) out.add(value);
  return out;
}

/** Numbers in a text that no figure shows. Small counts are allowed. */
export function unsupportedNumbers(text: string, figures: Figure[]) {
  const known = figureNumbers(figures);
  return numbersIn(text).filter((value) => value > SMALL && !known.has(value));
}

export function runChecks(review: Review | null, record: ForensicsRecord): ChecksRecord {
  const results: CheckResult[] = [];
  const add = (id: number, passed: boolean, detail: string) => results.push({ id, name: CHECK_NAMES[id - 1][1], passed, detail });
  if (!review) {
    for (const [id] of CHECK_NAMES) add(id, false, "The review could not be read.");
    return { passed: false, results };
  }
  const byId = new Map(record.figures.map((row) => [row.id, row]));
  const cite = (ids: string[]) => ids.map((id) => byId.get(id)).filter((row): row is Figure => row !== undefined);

  // 1. The stall code found is the one the review explains, with figures about that stage.
  const stallFigures = cite(review.stallFigureIds);
  const stallOk = record.stall ? stallFigures.some((row) => row.stageRef === record.stall!.stageRef) : review.stallReason.startsWith(NOT_ENOUGH_DATA);
  add(
    1,
    stallOk,
    stallOk
      ? record.stall
        ? `The review explains ${record.stall.name} with figures about that stage.`
        : "No stage stands out, and the review says so."
      : record.stall
        ? `The review cites no figure about ${record.stall.name}, the stage where most deals stop.`
        : `No stage stands out in the figures; the review must say "${NOT_ENOUGH_DATA}".`,
  );

  // 2. At least two findings, each citing real figures.
  const uncited = review.findings.filter((row) => cite(row.figureIds).length === 0);
  const findingsOk = review.findings.length >= 2 && uncited.length === 0;
  add(2, findingsOk, findingsOk ? `${review.findings.length} findings, each citing the CRM's own figures.` : review.findings.length < 2 ? "A review gives at least two findings." : `${uncited.length} finding(s) cite no known figure.`);

  // 3. Every number matches a figure (a finding, the figures it cites; the rest, any figure).
  const offending = new Set<number>();
  const test = (text: string, figures: Figure[]) => unsupportedNumbers(text, figures).forEach((value) => offending.add(value));
  test(`${review.summary} ${review.stallReason}`, record.figures);
  for (const row of review.findings) test(row.statement, cite(row.figureIds));
  for (const row of review.steps) test(`${row.problem} ${row.action} ${row.targetMetric} ${row.target}`, record.figures);
  add(3, offending.size === 0, offending.size === 0 ? "Every number matches a figure." : `These numbers match no figure: ${[...offending].slice(0, 6).join(", ")}.`);

  // 4 and 5. No outside benchmark; no promised result.
  const texts = [review.summary, review.stallReason, ...review.findings.map((row) => row.statement), ...review.steps.flatMap((row) => [row.problem, row.action, row.targetMetric, row.target])];
  const benchmark = texts.find((row) => BENCHMARK.test(row));
  add(4, !benchmark, benchmark ? `Compares against an outside benchmark: "${benchmark.slice(0, 80)}".` : "Compares the business only with its own figures.");
  const promise = texts.find((row) => claimsResult(row));
  add(5, !promise, promise ? `Reads as a promise: "${promise.slice(0, 80)}".` : "Says what to try and what to watch, not what will happen.");

  // 6. One to five steps, the first a Fix; each complete, and grounded or plainly "Not enough data".
  const steps = review.steps;
  const incomplete = steps.filter((row) => !row.problem || !row.action || !row.targetMetric || !row.target);
  const ungrounded = steps.filter((row) => cite(row.figureIds).length === 0 && !row.problem.startsWith(NOT_ENOUGH_DATA));
  const planOk = steps.length >= 1 && steps.length <= MAX_STEPS && steps[0].phase === "fix" && incomplete.length === 0 && ungrounded.length === 0;
  add(
    6,
    planOk,
    planOk
      ? `${steps.length} step(s), Fix first, each with its figures, action, measure and target.`
      : steps.length === 0
        ? "The plan has no steps."
        : steps[0].phase !== "fix"
          ? "The plan does not start with a Fix step."
          : incomplete.length
            ? `${incomplete.length} step(s) miss a problem, action, measure or target.`
            : `${ungrounded.length} step(s) cite no figure and do not say "${NOT_ENOUGH_DATA}".`,
  );

  return { passed: results.every((row) => row.passed), results };
}
