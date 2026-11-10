import { BASIS_LABEL } from "../../lib/evidence";
import { SECTION_BY_KEY } from "./framework";
import { HONEST_LIMIT, type ChecksRecord, type IndustryRead, type PagesRecord } from "./shapes";

const names = (keys: readonly (keyof typeof SECTION_BY_KEY)[]) => keys.map((key) => SECTION_BY_KEY[key].name).join(", ") || "none";

/** The teardown as Markdown, for the asset page and its history. Screens draw from the saved record, not from this. */
export function renderTeardown(read: IndustryRead | null, record: PagesRecord, checks: ChecksRecord, notes: string[]): string {
  const lines: string[] = [`# Landing page teardown: ${record.industry}`, ""];
  for (const note of notes) lines.push(`> ${note}`, "");
  if (read?.summary) lines.push(read.summary, "");
  lines.push("## Pages read", "");
  for (const page of record.pages) {
    lines.push(`### ${page.id}: ${page.title || page.host}${page.own ? " (your page)" : ""}`, "", page.finalUrl, "");
    lines.push(`- Answers, in order: ${names(page.order)}`, `- Skips: ${names(page.skipped)}`, `- Buttons: ${page.facts.ctaCount}${page.facts.ctaTexts.length ? ` (${page.facts.ctaTexts.map((text) => `"${text}"`).join(", ")})` : ""}, leading to ${page.facts.ctaTargets} place${page.facts.ctaTargets === 1 ? "" : "s"}`, `- Links in the header: ${page.facts.navLinks}`);
    if (page.analysis?.qualifier.quote) lines.push(`- Qualifier: "${page.analysis.qualifier.quote}"`);
    if (page.analysis) lines.push(`- Pains and fixes: ${page.analysis.pains.length} and ${page.analysis.solutions.length}`);
    lines.push("");
    for (const section of page.analysis?.sections ?? []) {
      if (section.job !== "other") lines.push(`- **${SECTION_BY_KEY[section.job].name}** (${section.does === "yes" ? "does its job" : section.does === "partly" ? "partly" : "does not do its job"}): ${section.note}`);
    }
    lines.push("");
  }
  if (record.unread.length) {
    lines.push("## Pages not read", "");
    for (const page of record.unread) lines.push(`- ${page.url}: ${page.reason}`);
    lines.push("");
  }
  if (read?.patterns.length) {
    lines.push("## What these pages share", "");
    for (const row of read.patterns) lines.push(`- [${BASIS_LABEL[row.basis]}] ${row.statement} (${row.pageIds.join(", ")}). Why it may work: ${row.whyItMayWork}`);
    lines.push("");
  }
  if (read?.gaps.length) {
    lines.push("## What your page lacks", "");
    for (const row of read.gaps) lines.push(`- [${BASIS_LABEL.inferred}] ${row.statement} (${row.pageIds.join(", ")})`);
    lines.push("");
  }
  if (read?.suggestions.length) {
    lines.push("## Changes to try", "");
    for (const row of read.suggestions) lines.push(`- [${BASIS_LABEL[row.basis]}] **${row.title}**: ${row.change} Why: ${row.why} How to tell: ${row.howToTell}`);
    lines.push("");
  }
  lines.push("## Limits", "", `- ${HONEST_LIMIT}`);
  for (const limit of read?.limits ?? []) lines.push(`- ${limit}`);
  const failed = checks.results.filter((row) => !row.passed);
  if (failed.length) {
    lines.push("", "## Checks that did not pass", "");
    for (const row of failed) lines.push(`- ${row.name}: ${row.detail}`);
  }
  return lines.join("\n");
}
