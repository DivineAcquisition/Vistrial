/**
 * The call review as plain Markdown for the asset body, and as the view the Calls tab draws. What counts as
 * "said on the call" is decided here, in code: a field or an objection stands only when its quote is in its source.
 */

import type { ReviewView } from "../../lib/dealmaker/reviewView";
import { quoted } from "../dealBriefing/checks";
import { quoteSpeaker, speakerWords, type QuoteSpeaker } from "../../lib/dealmaker/speakers";
import { dueOf } from "./checks";
import { FIT_FIELDS, FIT_WORDS, NOT_ENOUGH_DATA, type ChecksRecord, type Review, type ReviewRecord, type ReviewSource } from "./shapes";

/** Who said a quote, from its source: the buyer or our side on the call, by its speaker label, or the closer's account in the notes. */
export function whoSaid(source: ReviewSource | undefined, quote: string, leadName: string): QuoteSpeaker | { kind: "notes"; speaker: string } {
  if (source?.type === "call") return quoteSpeaker(quote, source.text, leadName);
  return { kind: "notes", speaker: source?.by ?? "the closer" };
}

const KIND = (source: ReviewSource | undefined, quote: string, leadName: string) => {
  const who = whoSaid(source, quote, leadName);
  return who.kind === "notes" ? `Rep's account, ${who.speaker}` : speakerWords(who);
};

/** The parts of a review that hold: quotes found in their sources, script steps covered with a quote from the call. */
export function settled(review: Review, record: ReviewRecord) {
  const sources = new Map(record.sources.map((row) => [row.id, row]));
  const ok = (quote: string, sourceId: string) => Boolean(sources.get(sourceId)) && quoted(quote, sources.get(sourceId)!.text);
  const call = record.sources.find((row) => row.type === "call");
  const fit = FIT_FIELDS.map((field) => {
    const row = review.fit.find((item) => item.field === field && ok(item.quote, item.sourceId));
    return row ? { field, label: FIT_WORDS[field], said: true, finding: row.finding, quote: row.quote, kind: KIND(sources.get(row.sourceId), row.quote, record.leadName), sourceId: row.sourceId } : { field, label: FIT_WORDS[field], said: false, finding: "", quote: "" };
  });
  const objections = review.objections.filter((row) => row.quote && ok(row.quote, row.sourceId)).map((row) => ({ text: row.objection, quote: row.quote, kind: KIND(sources.get(row.sourceId), row.quote, record.leadName), answered: row.answered && Boolean(call) && quoted(row.answerQuote, call!.text), answerQuote: row.answerQuote, sourceId: row.sourceId }));
  const commitments = review.commitments
    .filter((row) => row.quote && row.what && ok(row.quote, row.sourceId))
    .map((row) => {
      const due = dueOf(row.due, record.callDate);
      return { owner: row.owner, what: row.what, due: typeof due === "number" ? due : null, quote: row.quote, kind: KIND(sources.get(row.sourceId), row.quote, record.leadName), sourceId: row.sourceId };
    });
  const steps = record.playbook.filter((row) => row.kind === "scriptStep");
  const coverage = steps.map((step) => {
    const row = review.coverage.find((item) => item.itemId === step.id && call && quoted(item.quote, call.text));
    return { title: step.title, covered: Boolean(row), quote: row?.quote ?? "" };
  });
  return { fit, objections, commitments, coverage };
}

function talkLines(record: ReviewRecord) {
  if (!record.talk) return [];
  return ["## Who spoke", "", "| Speaker | Words | Share | Questions |", "|---|---|---|---|", ...record.talk.map((row) => `| ${row.name} | ${row.words} | ${row.share}% | ${row.questions} |`), "", "_Measured result: counted in code from the transcript's speaker labels._", ""];
}

export function renderReview(review: Review, record: ReviewRecord, checks: ChecksRecord, updates: ReviewView["updates"], notes: string[]) {
  const parts = settled(review, record);
  const lines = [`# Call review: ${record.leadName}${record.callDate ? `, ${record.callDate}` : ""}`, "", `**${review.outcome}** _(Inference)_`, "", `Next step: ${review.nextStep || NOT_ENOUGH_DATA}`, ""];
  if (!checks.passed) {
    lines.push("## Needs review", "", "This review did not pass every completion check:", "");
    for (const row of checks.results.filter((item) => !item.passed)) lines.push(`- **${row.name}.** ${row.detail}`);
    for (const note of notes) lines.push(`- ${note}`);
    lines.push("");
  }
  lines.push(...talkLines(record));
  lines.push("## Fit", "", "| Field | Said | Evidence |", "|---|---|---|");
  for (const row of parts.fit) lines.push(row.said ? `| ${row.label} | ${row.finding} | ${row.kind}: "${row.quote}" |` : `| ${row.label} | Not raised on the call | ${NOT_ENOUGH_DATA} |`);
  lines.push("");
  if (parts.objections.length) {
    lines.push("## Objections", "");
    for (const row of parts.objections) lines.push(`- ${row.text}: "${row.quote}" _(${row.kind})_ ${row.answered ? `**Answered on the call:** "${row.answerQuote}"` : "**Not answered on the call.**"}`);
    lines.push("");
  }
  if (parts.commitments.length) {
    lines.push("## Commitments", "");
    for (const row of parts.commitments) lines.push(`- **${row.owner === "us" ? "We" : record.leadName}:** ${row.what}${row.due ? ` (by ${new Date(row.due).toISOString().slice(0, 10)})` : ""}. "${row.quote}"`);
    lines.push("");
  }
  if (parts.coverage.length) {
    lines.push("## Your script", "");
    for (const row of parts.coverage) lines.push(`- ${row.covered ? "Covered" : "Not seen on the call"}: ${row.title}${row.covered ? ` ("${row.quote}")` : ""}`);
    lines.push("");
  }
  if (updates.length) {
    lines.push("## CRM updates", "");
    for (const row of updates) lines.push(`- ${row.words}: ${row.state === "proposed" ? "waiting for approval" : row.detail}`);
    lines.push("");
  }
  if (review.recap.body) lines.push("## Recap for the lead (a draft in Comms)", "", `**${review.recap.subject}**`, "", review.recap.body, "");
  if (record.missing.length) {
    lines.push("## What this review could not read", "");
    for (const text of record.missing) lines.push(`- ${text}`);
    lines.push("");
  }
  lines.push("_Quotes are the buyer's own words from the call, or the closer's account from their notes. Everything else is Dealmaker's reading for you to judge._");
  return lines.join("\n");
}

export function viewOf(review: Review, record: ReviewRecord, checksPassed: boolean, updates: ReviewView["updates"], recapDraft: ReviewView["recap"]): ReviewView {
  const parts = settled(review, record);
  return {
    outcome: review.outcome,
    nextStep: review.nextStep,
    checksPassed,
    ...(record.talk ? { talk: record.talk } : {}),
    fit: parts.fit.map(({ field, label, said, finding, quote, ...rest }) => ({ field, label, said, finding, quote, ...("kind" in rest && rest.kind ? { kind: rest.kind } : {}) })),
    objections: parts.objections.map(({ text, quote, kind, answered, answerQuote }) => ({ text, quote, kind, answered, answerQuote })),
    commitments: parts.commitments.map((row) => ({ owner: row.owner === "us" ? "We" : record.leadName, what: row.what, ...(row.due ? { due: row.due } : {}), quote: row.quote, kind: row.kind })),
    coverage: parts.coverage,
    updates,
    ...(recapDraft ? { recap: recapDraft } : {}),
    missing: record.missing,
  };
}
