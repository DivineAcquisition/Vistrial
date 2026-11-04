import type { ChecksRecord, ContextRecord, Report } from "./shapes";

const BASIS_WORDS: Record<string, string> = {
  observed: "Observed",
  inferred: "Inference",
  hypothesis: "Untested hypothesis",
  firstParty: "Your data",
  insufficient: "Not enough data",
};

/** The report as plain Markdown for the asset body. Claims and their sources are also saved as evidence rows. */
export function renderReport(report: Report, context: ContextRecord, checks: ChecksRecord, notes: string[]): string {
  const lines: string[] = [];
  lines.push(`# Market report`, "", `**Objective:** ${report.objective}`, "", report.summary, "");
  if (!checks.passed) {
    lines.push("## Needs review", "", "This draft did not pass every completion check:", "");
    for (const row of checks.results.filter((item) => !item.passed)) lines.push(`- **${row.name}.** ${row.detail}`);
    for (const note of notes) lines.push(`- ${note}`);
    lines.push("");
  }
  lines.push("## Opportunities", "");
  report.opportunities.forEach((row, i) => {
    const evidence =
      row.evidence.uncertainty === "none"
        ? `${row.evidence.sourceRefIds.length} source${row.evidence.sourceRefIds.length === 1 ? "" : "s"}`
        : BASIS_WORDS[row.evidence.uncertainty];
    lines.push(
      `### ${i + 1}. ${row.opportunity}`,
      "",
      `- **Evidence:** ${evidence}`,
      `- **Why it matters here:** ${row.businessRelevance.text}`,
      `- **Proposed action:** ${row.proposedAction}`,
      `- **How to tell if it worked:** ${row.validationMethod}`,
      "",
    );
  });
  if (report.opportunities.length < 3) {
    lines.push(`_Only ${report.opportunities.length} opportunit${report.opportunities.length === 1 ? "y is" : "ies are"} supported by the evidence. ${report.missingOpportunityReason}_`, "");
  }
  lines.push("## Findings", "");
  for (const row of report.findings) lines.push(`- ${row.statement} _(${row.basis ? BASIS_WORDS[row.basis] : "No basis"})_`);
  lines.push("", "## Limits", "");
  if (report.limits.length === 0) lines.push("- None reported.");
  for (const row of report.limits) lines.push(`- **${row.platform}:** ${row.text}`);
  lines.push("", "## Context used", "");
  lines.push(context.profile && report.contextUsed.profileVersionId ? "- The confirmed business profile." : "- No confirmed business profile.");
  const facts = context.facts.filter((row) => report.contextUsed.factIds.includes(row.id));
  for (const fact of facts) lines.push(`- ${fact.factKey}: ${fact.value} _(${fact.status}, recorded ${new Date(fact.recordedAt).toISOString().slice(0, 10)})_`);
  lines.push("", "_Publicly visible ads and posts are not evidence that a campaign was profitable._");
  return lines.join("\n");
}
