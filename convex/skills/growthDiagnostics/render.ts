import { STAGE_WORDS, type ChecksRecord, type Diagnosis, type DiagnosticsRecord, type Figure } from "./shapes";

function figureLine(row: Figure) {
  const how = row.computed ? `computed${row.formula ? `: ${row.formula}` : ""}` : "as reported";
  return `${row.label}: **${row.display}** _(${how}${row.period ? `; ${row.period}` : ""})_`;
}

function cited(record: DiagnosticsRecord, ids: string[]) {
  const byId = new Map(record.figures.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is Figure => row !== undefined);
}

/** The "Not enough data" diagnosis: what is missing and exactly what to connect. Nothing else. */
export function renderNotEnough(record: DiagnosticsRecord) {
  const lines = ["# Growth diagnosis", "", "## Not enough data", ""];
  for (const row of record.missing) lines.push(`- ${row.text}`);
  lines.push("", "_Nothing was estimated or compared with outside figures. Run the diagnosis again once one of these is in place._");
  return lines.join("\n");
}

/** The diagnosis as plain Markdown for the asset body. Claims and their sources are also saved as evidence rows. */
export function renderDiagnosis(diagnosis: Diagnosis, record: DiagnosticsRecord, checks: ChecksRecord, notes: string[]) {
  const lines: string[] = ["# Growth diagnosis", "", diagnosis.summary, ""];
  if (!checks.passed) {
    lines.push("## Needs review", "", "This draft did not pass every completion check:", "");
    for (const row of checks.results.filter((item) => !item.passed)) lines.push(`- **${row.name}.** ${row.detail}`);
    for (const note of notes) lines.push(`- ${note}`);
    lines.push("");
  }
  lines.push("## Where growth stalls", "");
  if (diagnosis.stage === "unknown") lines.push("Not enough data to name a stage.", "");
  else {
    lines.push(`**${STAGE_WORDS[diagnosis.stage]}.** ${diagnosis.stageReason}`, "");
    for (const row of cited(record, diagnosis.stageFigureIds)) lines.push(`- ${figureLine(row)}`);
    lines.push("");
  }
  lines.push("## Findings", "");
  for (const row of diagnosis.findings) {
    lines.push(`- ${row.statement} _(Your data)_`);
    for (const figure of cited(record, row.figureIds)) lines.push(`  - ${figureLine(figure)}`);
  }
  lines.push("", "## Fixes, in order", "");
  diagnosis.fixes.forEach((row, i) => {
    lines.push(`### ${i + 1}. ${row.fix}`, "", `- **Why:** ${row.why}`, `- **How to tell if it worked:** ${row.howToTell}`, "");
  });
  const gaps = record.missing.map((row) => row.text);
  if (gaps.length || diagnosis.limits.length) {
    lines.push("## Limits", "");
    for (const text of [...gaps, ...diagnosis.limits]) lines.push(`- ${text}`);
    lines.push("");
  }
  lines.push("## Figures used", "");
  for (const row of record.figures) lines.push(`- ${figureLine(row)}`);
  lines.push("", "_Every figure comes from your own data. Computed figures were worked out in code from the figures beside them. Nothing is compared with industry averages._");
  return lines.join("\n");
}
