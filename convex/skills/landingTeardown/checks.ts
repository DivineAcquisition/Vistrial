/**
 * The completion checks, in code. A teardown is only as good as what it can show, so every finding must
 * point at pages that really carry it, and no line may claim to know why a page converts.
 */
import { SECTION_BY_KEY } from "./framework";
import type { CheckResult, ChecksRecord, IndustryRead, PagesRecord } from "./shapes";

export const CHECK_NAMES: [string, string][] = [
  ["pages_cited", "Every finding cites pages that were read"],
  ["patterns_shared", "A shared pattern is on at least two pages"],
  ["patterns_true", "A pattern about a section is true of every page it cites"],
  ["gaps_true", "A gap is really missing from your page and present on the pages cited"],
  ["no_causal_claims", "Nothing claims to know why a page converts"],
  ["suggestions_testable", "Every suggestion says what to change and how to tell"],
  ["brief_complete", "The brief names an audience, a promise and a call to action"],
];

/**
 * Words that state a cause or a result Vistrial cannot see. A page's conversion rate is not on the page, so
 * "works" is only ever "these running pages share it".
 */
export const CAUSAL = [
  /\bproven\b/i,
  /\bprove[sd]?\s+(that\s+)?(it|this|they|these)\s+(works?|converts?)\b/i,
  /\bguarantee[sd]?\s+(to|that|more|higher|better)\b/i,
  /\bwill\s+(increase|boost|raise|lift|double|triple|improve|drive|grow|convert)\b/i,
  /\bconverts?\s+(better|more|best|higher|well)\b/i,
  /\b(high|higher|highest|top|best)[- ]convert/i,
  /\b(increases?|boosts?|lifts?|raises?|drives?|maximi[sz]es?)\s+(the\s+)?(conversions?|conversion rate|sales|revenue|bookings|leads)\b/i,
  /\bconversion rate (is|was|of)\b/i,
  /\bbest[- ]performing\b/i,
  /\bmost effective\b/i,
  /\b(is|are) (the reason|why) (it|they|this|these|the page|the pages) (works?|converts?|wins?)\b/i,
  /\b\d+(\.\d+)?\s?% (more|higher|better|lift|increase)\b/i,
];

export function causalPhrase(text: string): string | null {
  for (const pattern of CAUSAL) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

const result = (key: string, passed: boolean, detail: string): CheckResult => ({ key, name: CHECK_NAMES.find(([id]) => id === key)?.[1] ?? key, passed, detail: passed ? "" : detail });

export function runChecks(read: IndustryRead | null, record: PagesRecord): ChecksRecord {
  if (!read) return { passed: false, results: CHECK_NAMES.map(([key, name]) => ({ key, name, passed: false, detail: "No findings were written." })) };
  const analysed = new Map(record.pages.filter((page) => page.analysis).map((page) => [page.id, page]));
  const own = record.ownId ? (analysed.get(record.ownId) ?? null) : null;
  const others = [...analysed.values()].filter((page) => !page.own);
  const results: CheckResult[] = [];

  const unknown = [...read.patterns, ...read.gaps, ...read.suggestions].flatMap((row) => row.pageIds).filter((id) => !analysed.has(id));
  const uncited = [...read.patterns.filter((row) => row.pageIds.length === 0).map((row) => row.statement), ...read.suggestions.filter((row) => row.basis === "inferred" && row.pageIds.length === 0).map((row) => row.title)];
  results.push(
    result(
      "pages_cited",
      unknown.length === 0 && uncited.length === 0,
      unknown.length ? `These page ids are not pages that were read: ${[...new Set(unknown)].join(", ")}.` : `These cite no page: ${uncited.slice(0, 3).join("; ")}. An inference needs the pages it rests on; without them it is a hypothesis.`,
    ),
  );

  const thin = read.patterns.filter((row) => new Set(row.pageIds.filter((id) => analysed.get(id) && !analysed.get(id)!.own)).size < 2);
  results.push(
    result(
      "patterns_shared",
      others.length < 2 ? read.patterns.length === 0 : thin.length === 0,
      others.length < 2 ? "Fewer than two other pages were read, so there are no shared patterns to report. Leave patterns empty." : `Each pattern must cite at least two pages other than the business's own: ${thin.slice(0, 3).map((row) => row.statement).join("; ")}.`,
    ),
  );

  const untrue = read.patterns.filter((row) => row.job && row.pageIds.some((id) => analysed.has(id) && !analysed.get(id)!.order.includes(row.job!)));
  results.push(result("patterns_true", untrue.length === 0, `These name a section some of their cited pages do not have: ${untrue.slice(0, 3).map((row) => `${row.statement} (${SECTION_BY_KEY[row.job!].name})`).join("; ")}.`));

  const badGaps = own
    ? read.gaps.filter((row) => row.job && (own.order.includes(row.job) || row.pageIds.some((id) => analysed.has(id) && !analysed.get(id)!.order.includes(row.job!))))
    : read.gaps;
  results.push(
    result(
      "gaps_true",
      badGaps.length === 0,
      own ? `These gaps name a section your page already has, or cite a page that lacks it too: ${badGaps.slice(0, 3).map((row) => row.statement).join("; ")}.` : "The business's own page was not read, so there are no gaps to report. Leave gaps empty.",
    ),
  );

  const lines = [read.summary, ...read.patterns.flatMap((row) => [row.statement, row.whyItMayWork]), ...read.gaps.map((row) => row.statement), ...read.suggestions.flatMap((row) => [row.title, row.change, row.why])];
  const causal = lines.map((text) => ({ text, phrase: causalPhrase(text) })).filter((row) => row.phrase);
  results.push(
    result(
      "no_causal_claims",
      causal.length === 0,
      `These state a cause or a result that cannot be seen on a page: ${causal.slice(0, 4).map((row) => `"${row.phrase}" in "${row.text.slice(0, 80)}"`).join("; ")}. Say what the pages do and why it may work, not that it does.`,
    ),
  );

  const vague = read.suggestions.filter((row) => !row.change || !row.howToTell);
  results.push(result("suggestions_testable", read.suggestions.length > 0 && vague.length === 0, read.suggestions.length === 0 ? "Give at least one change to try." : `These lack a change or a way to tell: ${vague.map((row) => row.title).join("; ")}.`));

  const brief = read.brief;
  results.push(result("brief_complete", Boolean(brief.audience && brief.promise && brief.cta && brief.sections.length >= 3), "The brief needs an audience, a promise, a call to action and at least three sections with a direction each."));

  return { passed: results.every((row) => row.passed), results };
}
