/**
 * The pipeline review as plain Markdown for the asset body: the full text, one step away on the screen.
 * The screen draws the answer and the stage table from the saved record and evidence rows, not from this.
 */

import { money } from "./compute";
import { PLAN_PHASES, PLAN_WORDS, type ChecksRecord, type Figure, type ForensicsRecord, type Review } from "./shapes";

function figureLine(row: Figure) {
  const how = row.computed ? `computed${row.formula ? `: ${row.formula}` : ""}` : "as read";
  return `${row.label}: **${row.display}** _(${how}${row.period ? `; ${row.period}` : ""})_`;
}

function cited(record: ForensicsRecord, ids: string[]) {
  const byId = new Map(record.figures.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is Figure => row !== undefined);
}

function stageTable(record: ForensicsRecord) {
  const currency = record.crm?.currency ?? "USD";
  const lines = ["| Stage | Open | Value | Quiet | Typical days there | Moved on |", "|---|---|---|---|---|---|"];
  for (const row of record.stages) {
    const flag = record.stall?.stageRef === row.ref ? " (most deals stop here)" : "";
    lines.push(`| ${row.name}${flag} | ${row.open} | ${money(row.openValue, currency)} | ${row.stalled} | ${row.medianDays ?? "Not enough data"} | ${row.movedOn} |`);
  }
  return lines;
}

/** No CRM, or too few deals: what was found and what to do. Nothing else. */
export function renderNotEnough(record: ForensicsRecord) {
  const lines = ["# Pipeline review", "", "## Not enough data", ""];
  for (const text of record.missing) lines.push(`- ${text}`);
  lines.push("", "_Nothing was estimated or compared with outside figures._");
  return lines.join("\n");
}

export function renderReview(review: Review, record: ForensicsRecord, checks: ChecksRecord, notes: string[]) {
  const lines: string[] = ["# Pipeline review", ""];
  if (record.crm && record.pipeline) lines.push(`_${record.crm.label}: ${record.crm.accountName}, the ${record.pipeline.name} pipeline, last ${record.windowDays} days. A deal is quiet after ${record.stalledDays} days with no activity and no stage change._`, "");
  lines.push(review.summary, "");
  if (!checks.passed) {
    lines.push("## Needs review", "", "This draft did not pass every completion check:", "");
    for (const row of checks.results.filter((item) => !item.passed)) lines.push(`- **${row.name}.** ${row.detail}`);
    for (const note of notes) lines.push(`- ${note}`);
    lines.push("");
  }
  lines.push("## Where deals stop", "");
  lines.push(record.stall ? `**${record.stall.name}.** ${review.stallReason}` : review.stallReason, "");
  for (const row of cited(record, review.stallFigureIds)) lines.push(`- ${figureLine(row)}`);
  lines.push("", "## The pipeline, stage by stage", "", ...stageTable(record), "");
  lines.push("## Findings", "");
  for (const row of review.findings) {
    lines.push(`- ${row.statement} _(Your data)_`);
    for (const figure of cited(record, row.figureIds)) lines.push(`  - ${figureLine(figure)}`);
  }
  lines.push("", "## What to try", "");
  for (const phase of PLAN_PHASES) {
    for (const row of review.steps.filter((step) => step.phase === phase)) {
      lines.push(`- **${PLAN_WORDS[phase]}: ${row.action}**`, `  - Problem: ${row.problem}`, `  - Watch: ${row.targetMetric}. Target: ${row.target}`);
    }
  }
  if (record.missing.length || review.limits.length) {
    lines.push("", "## Limits", "");
    for (const text of [...record.missing, ...review.limits]) lines.push(`- ${text}`);
  }
  lines.push("", "## Figures used", "");
  for (const row of record.figures) lines.push(`- ${figureLine(row)}`);
  lines.push("", "_Every figure comes from your own CRM, worked out in code. Nothing is compared with industry averages._");
  return lines.join("\n");
}
