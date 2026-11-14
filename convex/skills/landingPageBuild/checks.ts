/**
 * The framework's rules for a page Vistrial builds, in code. A page that breaks one is never approved: it is
 * saved for a person to review. Results is dropped (not refused) when nothing on record proves it.
 */
import { causalPhrase } from "../landingTeardown/checks";
import { FAQ_TOPICS, FAQ_TOPIC_WORDS, WEAK_CTA } from "../landingTeardown/framework";
import type { BuildContext, CheckResult, ChecksRecord, PageLayout } from "./shapes";

export const CHECK_NAMES: [string, string][] = [
  ["required_sections", "Every required section has content"],
  ["pains_match", "Each pain has its own fix, one for one"],
  ["faq_topics", "The FAQ covers price, guarantee, who it's for, how long and what if it doesn't work"],
  ["cta_verbs", "Every button starts with a verb"],
  ["traceable", "Every claim points at what it was built from"],
  ["no_invented_numbers", "No number that nothing on record states"],
  ["no_causal_claims", "No claim that the page or offer is proven to work"],
  ["effort_shape", "The client's part is short, ours is long, and each step says the client's time"],
];

const result = (key: string, passed: boolean, detail: string): CheckResult => ({ key, name: CHECK_NAMES.find(([id]) => id === key)?.[1] ?? key, passed, detail: passed ? "" : detail });

/** Proof cards that rest on no proof on record are removed before the checks: no proof, no section. */
export function dropUnprovenResults(layout: PageLayout, context: BuildContext): { layout: PageLayout; dropped: number } {
  const proof = new Set(context.items.filter((item) => item.proof).map((item) => item.id));
  const kept = layout.results.filter((card) => card.metric && card.from.some((id) => proof.has(id)));
  return { layout: { ...layout, results: kept }, dropped: layout.results.length - kept.length };
}

const NUMBER = /\d/;

export function runChecks(layout: PageLayout | null, context: BuildContext): ChecksRecord {
  if (!layout) return { passed: false, results: CHECK_NAMES.map(([key, name]) => ({ key, name, passed: false, detail: "No page was written." })) };
  const results: CheckResult[] = [];
  const known = new Set(context.items.map((item) => item.id));
  const contextText = context.items.map((item) => item.text).join(" \n ");

  const empty: string[] = [];
  if (!layout.nav.cta) empty.push("Nav (a button)");
  if (!layout.hero.headline || !layout.hero.cta || !layout.hero.qualifier) empty.push("Hero (qualifier, headline and button)");
  if (layout.problem.length < 3) empty.push("Problem agitation (3 to 6 pains)");
  if (layout.solution.length === 0) empty.push("Solution");
  if (layout.offer.deliverables.length === 0 || !layout.offer.effortLine) empty.push("The offer (deliverables and the line that removes effort)");
  if (layout.compare.length < 3) empty.push("With vs without (at least 3 matched pairs)");
  if (layout.process.length < 3) empty.push("Process timeline (3 to 5 steps)");
  if (layout.roles.yours.length === 0 || layout.roles.ours.length === 0) empty.push("Your role vs ours");
  if (layout.faq.length === 0) empty.push("FAQ");
  if (!layout.finalCta.line || !layout.finalCta.cta) empty.push("Final CTA");
  results.push(result("required_sections", empty.length === 0, `These required sections are empty: ${empty.join("; ")}.`));

  results.push(result("pains_match", layout.problem.length === layout.solution.length && layout.problem.length >= 3, `There are ${layout.problem.length} pains and ${layout.solution.length} fixes; the framework wants the same number, 3 to 6.`));

  const covered = new Set(layout.faq.map((row) => row.topic));
  const missingTopics = FAQ_TOPICS.filter((topic) => !covered.has(topic));
  results.push(result("faq_topics", missingTopics.length === 0, `The FAQ does not cover: ${missingTopics.map((topic) => FAQ_TOPIC_WORDS[topic]).join(", ")}.`));

  const buttons = [layout.nav.cta, layout.hero.cta, layout.finalCta.cta].filter(Boolean);
  const weak = buttons.filter((cta) => WEAK_CTA.test(cta.trim()) || cta.trim().split(/\s+/).length > 6);
  results.push(result("cta_verbs", weak.length === 0, `These buttons are not a short verb-first action: ${weak.join("; ")}.`));

  const cited = [layout.hero, layout.offer, ...layout.problem, ...layout.solution, ...layout.faq, ...layout.results];
  const unknown = cited.flatMap((row) => row.from).filter((id) => !known.has(id));
  const bare = [
    ...(layout.hero.from.length ? [] : ["the hero"]),
    ...(layout.offer.from.length ? [] : ["the offer"]),
    ...layout.problem.filter((row) => row.from.length === 0).map((row) => row.moment),
    ...layout.faq.filter((row) => (row.topic === "price" || row.topic === "guarantee") && row.from.length === 0).map((row) => row.question),
  ];
  results.push(
    result(
      "traceable",
      unknown.length === 0 && bare.length === 0,
      unknown.length ? `These ids are not in the context: ${[...new Set(unknown)].slice(0, 6).join(", ")}.` : `These cite nothing they were built from: ${bare.slice(0, 4).join("; ")}.`,
    ),
  );

  // A number on the page (a price, a cost tag, a time saved) must appear in what it cites, or anywhere on record.
  const numbered = [
    { text: layout.offer.price, from: layout.offer.from },
    ...layout.problem.map((row) => ({ text: row.cost, from: row.from })),
    { text: layout.hero.headline, from: layout.hero.from },
    { text: layout.hero.qualifier, from: layout.hero.from },
    ...layout.faq.map((row) => ({ text: row.answer, from: row.from })),
  ];
  const invented = numbered.flatMap((row) => (row.text.match(/[$€£]?\d[\d,.]*[kKmM%]?/g) ?? []).filter((figure) => NUMBER.test(figure) && !contextText.includes(figure.replace(/[kKmM%]$/, "")))).slice(0, 6);
  results.push(result("no_invented_numbers", invented.length === 0, `These figures are not stated anywhere on record: ${[...new Set(invented)].join(", ")}. Use a stated figure, or say it without a number.`));

  const lines = [layout.hero.headline, layout.hero.subline, layout.offer.effortLine, layout.finalCta.line, ...layout.solution.map((row) => row.outcome), ...layout.faq.map((row) => row.answer)];
  const causal = lines.map((line) => ({ line, phrase: causalPhrase(line) })).filter((row) => row.phrase);
  results.push(result("no_causal_claims", causal.length === 0, `These claim a result nothing on record shows: ${causal.slice(0, 3).map((row) => `"${row.phrase}"`).join("; ")}.`));

  const noTime = layout.process.filter((row) => !row.yourTime);
  results.push(
    result(
      "effort_shape",
      layout.roles.yours.length < layout.roles.ours.length && noTime.length === 0 && layout.process.length <= 5,
      `The client's list must be shorter than ours, and every step needs the client's time (${noTime.length} lack it).`,
    ),
  );

  return { passed: results.every((row) => row.passed), results };
}
