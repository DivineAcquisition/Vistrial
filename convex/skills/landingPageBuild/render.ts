/**
 * The page as a person reads it in the asset view: the eleven sections in the framework's order, each with
 * what it was built from, then what the page leaves out and why. Pure.
 */
import { SECTION_BY_KEY } from "../landingTeardown/framework";
import type { BuildContext, ChecksRecord, PageLayout } from "./shapes";

function cites(from: string[], context: BuildContext) {
  const rows = from.map((id) => context.items.find((item) => item.id === id)).filter(Boolean);
  return rows.length ? `\n\n_Built from: ${rows.map((row) => row!.text).join(" · ")}_` : "";
}

export function renderPage(page: PageLayout, context: BuildContext, checks: ChecksRecord, droppedResults: number): string {
  const lines: string[] = [`# Landing page: ${context.selling.title || context.businessName}`, "", `**Goal:** ${page.goal}`, `**For:** ${page.audience}`, ""];
  const head = (key: keyof typeof SECTION_BY_KEY) => lines.push(`## ${SECTION_BY_KEY[key].name}`, `_${SECTION_BY_KEY[key].job}_`, "");
  head("nav");
  lines.push(`Button: **${page.nav.cta}**`, "");
  head("hero");
  lines.push(`> ${page.hero.qualifier}`, "", `### ${page.hero.headline}`, page.hero.subline, "", `Button: **${page.hero.cta}**`, ...(page.hero.scarcity ? ["", page.hero.scarcity] : []), cites(page.hero.from, context), "");
  if (page.results.length) {
    head("results");
    for (const card of page.results) lines.push(`- **${card.metric}** ${card.context}. "${card.quote}" ${card.name}${card.role ? `, ${card.role}` : ""}${cites(card.from, context)}`);
    lines.push("");
  }
  head("problem");
  for (const pain of page.problem) lines.push(`- ${pain.moment}${pain.cost ? ` (${pain.cost})` : ""}${cites(pain.from, context)}`);
  lines.push("");
  head("solution");
  for (const fix of page.solution) lines.push(`- ${fix.outcome}`);
  lines.push("");
  head("offer");
  lines.push(...page.offer.deliverables.map((row) => `- ${row}`), "", page.offer.effortLine, "", `**Price:** ${page.offer.price || "Given on the call"}${page.offer.delivery ? ` · **Delivery:** ${page.offer.delivery}` : ""}`, cites(page.offer.from, context), "");
  head("compare");
  lines.push("| Without | With |", "|---|---|", ...page.compare.map((row) => `| ${row.without} | ${row.with} |`), "");
  head("process");
  page.process.forEach((row, index) => lines.push(`${index + 1}. ${row.step} (Your time: ${row.yourTime})`));
  lines.push("");
  head("roles");
  lines.push("**Your part:**", ...page.roles.yours.map((row) => `- ${row}`), "", "**Ours:**", ...page.roles.ours.map((row) => `- ${row}`), "");
  head("faq");
  for (const row of page.faq) lines.push(`**${row.question}**`, row.answer, "");
  head("finalCta");
  lines.push(page.finalCta.line, "", `Button: **${page.finalCta.cta}**`, ...(page.finalCta.timing ? ["", page.finalCta.timing] : []), "");
  const left = [...context.gaps, ...(droppedResults ? [`${droppedResults} proof card${droppedResults === 1 ? " was" : "s were"} left out: nothing on record proves ${droppedResults === 1 ? "it" : "them"}.`] : []), ...page.limits];
  if (left.length) lines.push("## What this page leaves out", ...left.map((row) => `- ${row}`), "");
  const failed = checks.results.filter((row) => !row.passed);
  if (failed.length) lines.push("## Needs review", "This page is not ready to publish. The framework's rules it breaks:", ...failed.map((row) => `- ${row.name}: ${row.detail}`), "");
  return lines.join("\n");
}
