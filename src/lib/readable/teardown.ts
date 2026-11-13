/**
 * What the landing page teardown's at-a-glance layer is computed from. Everything here is code over fields the
 * saved teardown already has: which framework job each section was matched to, whether it does that job, what
 * code counted on the page, and which jobs have no section. Nothing here scores a page, and nothing calls a
 * model. A count is a count ("7 of 11 jobs have a section"); there is no grade.
 */
import type { EvidenceWord } from "./evidence";
import type { Needle } from "./highlight";

export type FrameworkJob = { key: string; name: string; job: string; objection: string; expected: boolean };
export type SectionLike = { job: string; name: string; does: "yes" | "partly" | "no"; note: string };
export type FactsLike = { ctaCount: number; ctaTexts: string[]; ctaTargets: number; weakCtas: string[]; navLinks: number };
export type PageLike = {
  sections: SectionLike[];
  facts: FactsLike;
  headline: { quote: string; statesOutcome: boolean } | null;
  qualifier: { quote: string; threshold: string } | null;
  proof: { kind: string; named: boolean; quotes: string[]; note: string } | null;
  pains: string[];
  solutions: string[];
  offer: { deliverables: string[]; effortLine: string; price: string } | null;
  faq: { topic: string; words: string; covered: boolean }[];
};

/** One framework job on one page. Exactly one of these, and each means one thing. */
export type JobStatus =
  /** A section was matched to the job and read as doing it. */
  | "does"
  /** A section was matched to the job and read as doing part of it. */
  | "partly"
  /** A section was matched to the job and read as not doing it. */
  | "doesNot"
  /** The framework expects the job and the page has no section for it. */
  | "skipped"
  /** The framework lets a page leave this job out (Results, when there is no real proof), and this page does. */
  | "leftOut";

export const JOB_STATUS_WORDS: Record<JobStatus, string> = {
  does: "Does its job",
  partly: "Partly",
  doesNot: "Does not do its job",
  skipped: "Skipped",
  leftOut: "Left out (optional)",
};

export type CoverageCell = {
  key: string;
  name: string;
  objection: string;
  status: JobStatus;
  /** Where the job first appears among the page's framework sections, counting from 1. Null when absent. */
  position: number | null;
  /** The page puts this job after one the framework places later. */
  late: boolean;
  /** The index of the job's first section in `sections`, for a link to it. */
  sectionIndex: number | null;
};

const RANK = { yes: 2, partly: 1, no: 0 } as const;
const STATUS = { yes: "does", partly: "partly", no: "doesNot" } as const;

/**
 * The coverage map: the framework's jobs in the framework's order, each with what this page does about it.
 * When a page has two sections for one job, the cell shows the better of the two.
 */
export function coverage(framework: readonly FrameworkJob[], sections: readonly SectionLike[]): CoverageCell[] {
  const order: string[] = [];
  for (const section of sections) if (section.job !== "other" && !order.includes(section.job)) order.push(section.job);
  const frameworkIndex = new Map(framework.map((row, index) => [row.key, index]));
  let furthest = -1;
  const late = new Set<string>();
  for (const key of order) {
    const at = frameworkIndex.get(key) ?? -1;
    if (at < furthest) late.add(key);
    furthest = Math.max(furthest, at);
  }
  return framework.map((row) => {
    const matched = sections.map((section, index) => ({ section, index })).filter((entry) => entry.section.job === row.key);
    if (matched.length === 0) return { key: row.key, name: row.name, objection: row.objection, status: row.expected ? "skipped" : "leftOut", position: null, late: false, sectionIndex: null };
    const best = matched.reduce((a, b) => (RANK[b.section.does] > RANK[a.section.does] ? b : a));
    return { key: row.key, name: row.name, objection: row.objection, status: STATUS[best.section.does], position: order.indexOf(row.key) + 1, late: late.has(row.key), sectionIndex: matched[0].index };
  });
}

export type CoverageCounts = { total: number; present: number; does: number; partly: number; doesNot: number; skipped: number; leftOut: number; late: number };

export function coverageCounts(cells: readonly CoverageCell[]): CoverageCounts {
  const count = (status: JobStatus) => cells.filter((cell) => cell.status === status).length;
  const skipped = count("skipped");
  const leftOut = count("leftOut");
  return { total: cells.length, present: cells.length - skipped - leftOut, does: count("does"), partly: count("partly"), doesNot: count("doesNot"), skipped, leftOut, late: cells.filter((cell) => cell.late).length };
}

const list = (words: string[]) => (words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`);
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/**
 * The verdict for one page when the saved teardown carries none of its own: a plain sentence built from the
 * coverage counts. Which job a section does is a reading of the page, so the sentence is an inference.
 */
export function pageVerdict(cells: readonly CoverageCell[]): { text: string; label: EvidenceWord } {
  const counts = coverageCounts(cells);
  if (counts.present === 0) return { text: "Not enough data: no section of this page was matched to a job in the framework.", label: "Not enough data" };
  const parts = [counts.does ? `${counts.does} ${counts.does === 1 ? "does its job" : "do their job"}` : "", counts.partly ? `${counts.partly} partly` : "", counts.doesNot ? `${counts.doesNot} ${counts.doesNot === 1 ? "does" : "do"} not` : ""].filter(Boolean);
  const skipped = cells.filter((cell) => cell.status === "skipped").map((cell) => cell.name);
  const first = `This page has a section for ${counts.present} of the framework's ${counts.total} jobs: ${list(parts)}.`;
  const second = skipped.length ? ` It skips ${list(skipped)}.` : " It skips none the framework expects.";
  return { text: first + second, label: "Inference" };
}

export type Point = { text: string; detail: string; label: EvidenceWord; sectionIndex: number | null };

/**
 * The points for one page, weakest and strongest, each from a field the teardown has. The order is a fixed rule,
 * not a ranking by importance: Vistrial cannot see which matters most to a page's results.
 *
 * Weakest, in this order: sections read as not doing their job (page order), expected jobs with no section
 * (framework order), sections read as partly doing their job (page order), then what code counted: buttons
 * that lead to more than one place, weak button wording, no proof, pains and fixes that do not pair up, a
 * headline that does not state an outcome, FAQ topics not covered.
 *
 * Strongest, in this order: what code counted (every button leads to one place, proof with numbers and named
 * quotes, pains and fixes that pair one for one), a headline that states an outcome, then sections read as
 * doing their job (page order).
 */
export function pagePoints(page: PageLike, cells: readonly CoverageCell[]): { weakest: Point[]; strongest: Point[] } {
  const weakest: Point[] = [];
  const strongest: Point[] = [];
  const sections = page.sections.map((section, index) => ({ section, index })).filter((entry) => entry.section.job !== "other");

  for (const { section, index } of sections) if (section.does === "no") weakest.push({ text: `${section.name} does not do its job`, detail: section.note, label: "Inference", sectionIndex: index });
  for (const cell of cells) if (cell.status === "skipped") weakest.push({ text: `No ${cell.name} section`, detail: `Nothing answers "${cell.objection}"`, label: "Inference", sectionIndex: null });
  for (const { section, index } of sections) if (section.does === "partly") weakest.push({ text: `${section.name} does part of its job`, detail: section.note, label: "Inference", sectionIndex: index });

  const { facts } = page;
  if (facts.ctaCount > 0 && facts.ctaTargets > 1) weakest.push({ text: `Buttons lead to ${facts.ctaTargets} places`, detail: `${plural(facts.ctaCount, "button")}: ${facts.ctaTexts.map((text) => `"${text}"`).join(", ")}.`, label: "Observed", sectionIndex: null });
  if (facts.ctaCount === 0) weakest.push({ text: "No button on the page", detail: "Code found no call to action.", label: "Observed", sectionIndex: null });
  if (facts.weakCtas.length) weakest.push({ text: "Weak button wording", detail: facts.weakCtas.map((text) => `"${text}"`).join(", "), label: "Observed", sectionIndex: null });
  if (!page.proof || page.proof.kind === "none") weakest.push({ text: "No proof on the page", detail: page.proof?.note ?? "", label: "Inference", sectionIndex: null });
  if (page.pains.length > 0 && page.pains.length !== page.solutions.length) weakest.push({ text: "Pains and fixes do not pair up", detail: `${plural(page.pains.length, "pain")}, ${plural(page.solutions.length, "fix", "fixes")}.`, label: "Inference", sectionIndex: null });
  if (page.headline?.quote && !page.headline.statesOutcome) weakest.push({ text: "The headline states the mechanism, not the outcome", detail: `"${page.headline.quote}"`, label: "Inference", sectionIndex: null });
  const uncovered = page.faq.filter((row) => !row.covered).map((row) => row.words);
  if (cells.some((cell) => cell.key === "faq" && cell.position !== null) && uncovered.length) weakest.push({ text: `The FAQ leaves out ${list(uncovered)}`, detail: "", label: "Inference", sectionIndex: null });

  if (facts.ctaCount > 0 && facts.ctaTargets === 1) strongest.push({ text: "Every button leads to one place", detail: `${plural(facts.ctaCount, "button")}: ${facts.ctaTexts.map((text) => `"${text}"`).join(", ")}.`, label: "Observed", sectionIndex: null });
  if (page.proof?.kind === "numbersAndQuotes" && page.proof.named) strongest.push({ text: "Proof has numbers and named quotes", detail: page.proof.note, label: "Inference", sectionIndex: null });
  if (page.pains.length > 0 && page.pains.length === page.solutions.length) strongest.push({ text: "Pains and fixes pair one for one", detail: `${plural(page.pains.length, "pain")}, ${plural(page.solutions.length, "fix", "fixes")}.`, label: "Inference", sectionIndex: null });
  if (page.headline?.quote && page.headline.statesOutcome) strongest.push({ text: "The headline states an outcome", detail: `"${page.headline.quote}"`, label: "Inference", sectionIndex: null });
  for (const { section, index } of sections) if (section.does === "yes") strongest.push({ text: `${section.name} does its job`, detail: section.note, label: "Inference", sectionIndex: index });

  return { weakest, strongest };
}

/** What to mark in a page's own words. Each needle is a quote the teardown saved; markText checks it is there. */
export function pageNeedles(page: Pick<PageLike, "pains" | "solutions" | "proof" | "qualifier" | "offer">): Needle[] {
  return [
    ...(page.qualifier?.quote ? [{ kind: "qualifier" as const, text: page.qualifier.quote }] : []),
    ...page.pains.map((text) => ({ kind: "pain" as const, text })),
    ...page.solutions.map((text) => ({ kind: "fix" as const, text })),
    ...(page.proof?.quotes ?? []).map((text) => ({ kind: "proof" as const, text })),
    ...(page.offer?.price ? [{ kind: "price" as const, text: page.offer.price }] : []),
  ];
}

export type ComparePage = { id: string; own: boolean; host: string; analysed: boolean; order: string[] };
export type CompareRow = {
  key: string;
  name: string;
  objection: string;
  /** For each page column, whether the page has a section doing the job, fully or partly (the saved `order`). */
  has: boolean[];
  /** How many of the other pages have it, and out of how many. */
  others: number;
  of: number;
  /** Your page has no section for it and at least one other page does. */
  lacking: boolean;
  /** Your page has it and no other page does. */
  onlyYours: boolean;
};

/**
 * The comparison across pages: framework jobs down, pages across (yours first). A cell is only "has a section
 * doing the job" or "none", because that is all the teardown saved for every page: a section read as not doing
 * its job is not counted as having it, the same rule the server's table and its gap check use. It says how many pages do a thing, never
 * how well any of them performs.
 */
export function comparePages(framework: readonly FrameworkJob[], pages: readonly ComparePage[]): { columns: ComparePage[]; rows: CompareRow[]; lacking: number; hasOwn: boolean } {
  const columns = [...pages.filter((page) => page.analysed && page.own), ...pages.filter((page) => page.analysed && !page.own)];
  const own = columns.find((page) => page.own) ?? null;
  const others = columns.filter((page) => !page.own);
  const rows = framework.map((job) => {
    const has = columns.map((page) => page.order.includes(job.key));
    const count = others.filter((page) => page.order.includes(job.key)).length;
    const mine = own ? own.order.includes(job.key) : false;
    return { key: job.key, name: job.name, objection: job.objection, has, others: count, of: others.length, lacking: Boolean(own) && !mine && count > 0, onlyYours: Boolean(own) && mine && others.length > 0 && count === 0 };
  });
  return { columns, rows, lacking: rows.filter((row) => row.lacking).length, hasOwn: Boolean(own) };
}
