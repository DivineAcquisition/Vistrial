/**
 * The pre-call brief as plain Markdown for the asset body, and the readiness worked out in code from the
 * model's quoted findings. The Calls tab draws the brief from the saved record; this is the full text, one step
 * away, and what a closer reads on a phone.
 */

import { when } from "./compute";
import { FIT_FIELDS, FIT_WORDS, NOT_ENOUGH_DATA, type Brief, type BriefRecord, type BriefSource, type ChecksRecord, type EvidenceKind, type FitField } from "./shapes";
import { quoted } from "./checks";
import { quoteSpeaker, speakerWords } from "../../lib/dealmaker/speakers";
import type { BriefView } from "../../lib/dealmaker/briefView";

export const KIND_WORDS: Record<EvidenceKind, string> = { recorded: "Recorded event", buyer: "Buyer's words", rep: "Rep's account", measured: "Measured result" };

export type ReadinessRow = {
  field: FitField;
  established: boolean;
  finding: string;
  quote: string;
  kind: EvidenceKind | null;
  /** The kind in words, with who: "Buyer's words", "Rep's words, Milo", or a speaker not named. */
  words: string | null;
  source: string | null;
};

/**
 * The kind of evidence a quote is: on a call, the buyer's words only when the lead's own line says it (our side's
 * line is a rep's words, an unlabelled line has no known speaker); a hand-off or a note is a person's account.
 */
export function kindOf(source: BriefSource, quote: string, leadName: string): { kind: EvidenceKind | null; words: string } {
  if (source.type !== "call") return { kind: "rep", words: KIND_WORDS.rep };
  const who = quoteSpeaker(quote, source.text, leadName);
  return { kind: who.kind === "buyer" ? "buyer" : who.kind === "rep" ? "rep" : null, words: speakerWords(who) };
}

function sourceWords(source: BriefSource) {
  return source.type === "call" ? `call: ${source.label}` : source.label;
}

/**
 * Each fit field, established only when the brief quotes a source that holds those words; otherwise unresolved.
 * Code decides, not the model: a finding whose quote is not in its source does not establish anything.
 */
export function readinessOf(brief: Brief | null, record: BriefRecord): ReadinessRow[] {
  const sources = new Map(record.sources.map((row) => [row.id, row]));
  return FIT_FIELDS.map((field) => {
    const found = (brief?.readiness ?? []).find((row) => row.field === field && sources.has(row.sourceId) && quoted(row.quote, sources.get(row.sourceId)!.text));
    if (!found) return { field, established: false, finding: "", quote: "", kind: null, words: null, source: null };
    const source = sources.get(found.sourceId)!;
    const said = kindOf(source, found.quote, record.leadName);
    return { field, established: true, finding: found.finding, quote: found.quote, kind: said.kind, words: said.words, source: sourceWords(source) };
  });
}

function title(record: BriefRecord) {
  return `# Pre-call brief: ${record.leadName}${record.call ? `, ${when(record.call.startsAt, record.crm?.timezone ?? null)}` : ""}`;
}

function factLines(record: BriefRecord, group: "who" | "soFar") {
  return record.facts.filter((row) => row.group === group).map((row) => `- ${row.label}: **${row.display}** _(${row.kind === "measured" ? `Measured result: ${row.formula}` : "Recorded event"})_`);
}

/** Code writes the parts it knows: who, so far, and what is missing. The model's parts follow when there are any. */
function frame(record: BriefRecord) {
  const lines = [title(record), ""];
  if (record.crm) lines.push(`_From ${record.crm.label}: ${record.crm.accountName}. Vistrial keeps no message words, so "so far" is counts and dates._`, "");
  const who = factLines(record, "who");
  lines.push("## Who", "", ...(who.length ? who : [`- ${record.leadName}. Nothing else is recorded.`]), "");
  const soFar = factLines(record, "soFar");
  if (soFar.length) lines.push("## So far", "", ...soFar, "");
  if (record.publicRead?.lines.length) {
    lines.push("## Their business, in public", "", `_From ${record.publicRead.domain}${record.publicRead.from === "email" ? ", the domain of their work email" : ""}. Observed on their own site: what the business says about itself._`, "");
    for (const row of record.publicRead.lines) lines.push(`- ${row.text} ([source](${row.url}))`);
    lines.push("");
  }
  return lines;
}

function tail(record: BriefRecord, lines: string[]) {
  if (record.missing.length) {
    lines.push("## What this brief could not read", "");
    for (const text of record.missing) lines.push(`- ${text}`);
    lines.push("");
  }
  lines.push("_Facts are as your CRM records them, quotes are the lead's own words or the named person's account, and everything else is Dealmaker's reading for you to judge._");
  return lines.join("\n");
}

/** No call, no hand-off and no offer: code writes the brief alone and says so, without padding. */
export function renderCodeOnly(record: BriefRecord) {
  const lines = frame(record);
  lines.push("## First call", "", "Nothing is known about this lead beyond the booking. Use the call to learn their need, budget, who decides and timing.", "");
  lines.push("## Unresolved", "", ...FIT_FIELDS.map((field) => `- ${FIT_WORDS[field]}: ${NOT_ENOUGH_DATA}`), "");
  return tail(record, lines);
}

export function renderBrief(brief: Brief, record: BriefRecord, checks: ChecksRecord, notes: string[]) {
  const sources = new Map(record.sources.map((row) => [row.id, row]));
  const items = new Map(record.playbook.map((row) => [row.id, row]));
  const lines = frame(record);
  lines.splice(2, 0, brief.summary, "");
  if (!checks.passed) {
    lines.push("## Needs review", "", "This brief did not pass every completion check:", "");
    for (const row of checks.results.filter((item) => !item.passed)) lines.push(`- **${row.name}.** ${row.detail}`);
    for (const note of notes) lines.push(`- ${note}`);
    lines.push("");
  }
  if (record.firstCall) lines.push("## First call", "", "No earlier call or hand-off is on record for this lead.", "");

  const readiness = readinessOf(brief, record);
  lines.push("## Readiness", "", "| Field | Where it stands | Evidence |", "|---|---|---|");
  for (const row of readiness) {
    lines.push(row.established ? `| ${FIT_WORDS[row.field]} | ${row.finding} | ${row.words} (${row.source}): "${row.quote}" |` : `| ${FIT_WORDS[row.field]} | Unresolved | ${NOT_ENOUGH_DATA} |`);
  }
  lines.push("");

  const handoff = record.sources.find((row) => row.type === "handoff");
  if (handoff) lines.push("## From the setter", "", `${KIND_WORDS.rep}, ${handoff.by}:`, "", ...handoff.text.split("\n").map((row) => `> ${row}`), "");

  if (brief.commitments.length) {
    lines.push("## Open commitments", "");
    for (const row of brief.commitments) lines.push(`- **${row.owner === "us" ? "We" : record.leadName}:** ${row.what}${row.due ? ` (by ${row.due})` : ""}. "${row.quote}"`);
    lines.push("");
  }

  if (brief.disagreements.length) {
    lines.push("## Records that disagree", "", "Dealmaker does not pick one. Check with the person who knows.", "");
    for (const row of brief.disagreements) lines.push(`- ${row.what}`);
    lines.push("");
  }

  lines.push("## Cover on this call", "", ...brief.cover.map((row) => `- [ ] ${row.point}`), "");

  const fit = items.get(brief.offerFit.itemId);
  lines.push("## The package that fits", "", fit ? `**${fit.title}.** ${brief.offerFit.why} _(Inference)_` : "None named: the offer or what is known about the lead is not enough to say.", "");

  if (brief.objections.length) {
    lines.push("## Likely objections", "");
    for (const row of brief.objections) {
      const source = sources.get(row.sourceId);
      const item = items.get(row.sourceId);
      const where = source ? `said on ${source.label}: "${row.quote}"` : item ? `from the Playbook${item.basis === "hypothesis" ? ", not yet heard on your calls" : ""}` : "";
      lines.push(`- ${row.objection} _(${where})_`);
    }
    lines.push("");
  }

  lines.push("## Opening question", "", `> ${brief.openingQuestion}`, "");
  return tail(record, lines);
}

/** The brief as the Calls tab draws it, with each line's evidence label decided here, in code. */
export function viewOf(brief: Brief | null, record: BriefRecord, checksPassed: boolean): BriefView {
  const sources = new Map(record.sources.map((row) => [row.id, row]));
  const items = new Map(record.playbook.map((row) => [row.id, row]));
  const handoff = record.sources.find((row) => row.type === "handoff");
  const fit = brief ? items.get(brief.offerFit.itemId) : undefined;
  // A point rests on what was read when it cites a fact or a source; on the Playbook alone it is untested.
  const grounded = (refs: string[]) => refs.some((id) => id.startsWith("F") || sources.has(id));
  return {
    summary: brief?.summary ?? "",
    codeOnly: brief === null,
    checksPassed,
    firstCall: record.firstCall,
    facts: record.facts.map((row) => ({ group: row.group, label: row.label, display: row.display, kind: row.kind === "measured" ? KIND_WORDS.measured : KIND_WORDS.recorded })),
    readiness: readinessOf(brief, record).map((row) => ({
      field: row.field,
      label: FIT_WORDS[row.field],
      established: row.established,
      finding: row.finding,
      quote: row.quote,
      ...(row.words ? { kind: row.words } : {}),
      ...(row.source ? { source: row.source } : {}),
    })),
    ...(handoff ? { handoff: { by: handoff.by ?? "a teammate", text: handoff.text } } : {}),
    commitments: (brief?.commitments ?? []).map((row) => ({ owner: row.owner === "us" ? "We" : record.leadName, what: row.what, due: row.due, quote: row.quote })),
    disagreements: (brief?.disagreements ?? []).map((row) => row.what),
    cover: (brief?.cover ?? []).map((row) => ({ point: row.point, label: grounded(row.refs) ? ("Inference" as const) : ("Untested hypothesis" as const) })),
    ...(fit ? { offerFit: { title: fit.title, why: brief!.offerFit.why } } : {}),
    objections: (brief?.objections ?? []).map((row) => {
      const source = sources.get(row.sourceId);
      const item = items.get(row.sourceId);
      return source
        ? { text: row.objection, where: `Said on ${source.label}: "${row.quote}"`, label: "Your data" as const }
        : { text: row.objection, where: item?.basis === "hypothesis" ? "From the Playbook's starter set, not yet heard on your calls" : "From your Playbook", label: "Untested hypothesis" as const };
    }),
    openingQuestion: brief?.openingQuestion ?? "",
    ...(record.publicRead?.lines.length ? { publicRead: record.publicRead } : {}),
    missing: record.missing,
  };
}
