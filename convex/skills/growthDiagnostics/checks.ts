import { MAX_FIXES, MIN_FIXES, type ChecksRecord, type CheckResult, type Diagnosis, type Figure, type DiagnosticsRecord } from "./shapes";

/**
 * The completion checks for a diagnosis, in code. No model call says a diagnosis passed. Each check reads
 * the structured answer against the figures computed in code.
 */
export const CHECK_NAMES = [
  [1, "The stall stage has data behind it"],
  [2, "Every finding cites the business's own figures"],
  [3, "Every number comes from a computed or reported figure"],
  [4, "Two or three fixes, each with how to tell if it worked"],
  [5, "No outside benchmarks"],
] as const;

/** Words that compare against figures the system cannot source. */
const BENCHMARK = /\b(industry|benchmarks?|on average|average (for|in|across)|typical(ly)? (for|in|of)|healthy (rate|ctr|range)|norm(al)? (for|in))\b/i;

/** Numbers small enough to be counts of things in the text ("two campaigns", "3 fixes"). */
const SMALL = 10;

/** Plain numbers in a text, without currency signs, thousands separators or a trailing percent. */
export function numbersIn(text: string): number[] {
  const found: number[] = [];
  // Dates and time windows ("over the next 30 days") are not figures either.
  const flat = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ").replace(/\b\d+\s*(minutes?|hours?|days?|weeks?|months?|quarters?|years?)\b/gi, " ");
  for (const match of flat.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const value = Number(match[0].replace(/,/g, ""));
    if (Number.isFinite(value)) found.push(value);
  }
  return found;
}

/** Every number a figure shows, in its display, its formula or its period. */
function figureNumbers(figures: Figure[]) {
  const out = new Set<number>();
  for (const row of figures) for (const value of numbersIn(`${row.display} ${row.formula ?? ""} ${row.period ?? ""} ${row.label}`)) out.add(value);
  return out;
}

/** The numbers in a text that no cited figure shows. Small counts are allowed. */
export function unsupportedNumbers(text: string, cited: Figure[]) {
  const known = figureNumbers(cited);
  return numbersIn(text).filter((value) => value > SMALL && !known.has(value));
}

export function runChecks(diagnosis: Diagnosis | null, record: DiagnosticsRecord): ChecksRecord {
  const results: CheckResult[] = [];
  const add = (id: number, name: string, passed: boolean, detail: string) => results.push({ id, name, passed, detail });
  if (!diagnosis) {
    for (const [id, name] of CHECK_NAMES) add(id, name, false, "The diagnosis could not be read.");
    return { passed: false, results };
  }
  const byId = new Map(record.figures.map((row) => [row.id, row]));
  const cite = (ids: string[]) => ids.map((id) => byId.get(id)).filter((row): row is Figure => row !== undefined);

  // 1. The stage named is one the data covers, and the figures behind it are about that stage.
  const stageFigures = cite(diagnosis.stageFigureIds);
  const stageOk =
    diagnosis.stage === "unknown"
      ? record.stagesWithData.length === 0
      : record.stagesWithData.includes(diagnosis.stage) && stageFigures.some((row) => row.stage === diagnosis.stage);
  add(
    1,
    CHECK_NAMES[0][1],
    stageOk,
    stageOk
      ? "The stage named has figures from the business's own data behind it."
      : diagnosis.stage === "unknown"
        ? "The diagnosis names no stage although the data covers some."
        : `The stage "${diagnosis.stage}" is not backed by a figure about that stage.`,
  );

  // 2. Each finding cites at least one real figure.
  const uncited = diagnosis.findings.filter((row) => cite(row.figureIds).length === 0);
  const findingsOk = diagnosis.findings.length > 0 && uncited.length === 0;
  add(
    2,
    CHECK_NAMES[1][1],
    findingsOk,
    findingsOk ? "Each finding cites figures computed or reported from the business's data." : diagnosis.findings.length === 0 ? "There are no findings." : `${uncited.length} finding(s) cite no known figure.`,
  );

  // 3. Every number in the text matches a figure it cites (the summary may use any figure).
  const offending: string[] = [];
  const check = (text: string, figures: Figure[]) => {
    const bad = unsupportedNumbers(text, figures);
    if (bad.length) offending.push(...bad.map(String));
  };
  check(`${diagnosis.summary} ${diagnosis.stageReason}`, record.figures);
  for (const row of diagnosis.findings) check(row.statement, cite(row.figureIds));
  for (const row of diagnosis.fixes) check(`${row.fix} ${row.why} ${row.howToTell}`, record.figures);
  add(3, CHECK_NAMES[2][1], offending.length === 0, offending.length === 0 ? "Every number matches a figure." : `These numbers match no figure: ${[...new Set(offending)].slice(0, 6).join(", ")}.`);

  // 4. Two or three distinct fixes, each grounded in a figure and with a way to tell if it worked.
  const fixes = diagnosis.fixes;
  const distinct = new Set(fixes.map((row) => row.fix.toLowerCase())).size === fixes.length;
  const complete = fixes.every((row) => row.fix && row.howToTell && cite(row.figureIds).length > 0);
  const fixesOk = fixes.length >= MIN_FIXES && fixes.length <= MAX_FIXES && distinct && complete;
  add(
    4,
    CHECK_NAMES[3][1],
    fixesOk,
    fixesOk
      ? `${fixes.length} fixes, each with the figures behind it and how to tell if it worked.`
      : fixes.length < MIN_FIXES || fixes.length > MAX_FIXES
        ? `There are ${fixes.length} fixes; a diagnosis gives ${MIN_FIXES} or ${MAX_FIXES}.`
        : !distinct
          ? "Two fixes are the same."
          : "A fix has no figure behind it or no way to tell if it worked.",
  );

  // 5. No comparison with figures the system cannot source.
  const texts = [diagnosis.summary, diagnosis.stageReason, ...diagnosis.findings.map((row) => row.statement), ...diagnosis.fixes.flatMap((row) => [row.fix, row.why, row.howToTell])];
  const benchmark = texts.find((row) => BENCHMARK.test(row));
  add(5, CHECK_NAMES[4][1], !benchmark, benchmark ? `Compares against an outside benchmark: "${benchmark.slice(0, 80)}".` : "Compares the business only with its own figures.");

  return { passed: results.every((row) => row.passed), results };
}
