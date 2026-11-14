/**
 * The proposal as plain Markdown for the asset body, and as the view a screen draws. The offer items' words are
 * copied from the Offer folder here, in code; the model only picked them.
 */

import type { Id } from "../../_generated/dataModel";
import type { ProposalView } from "../../lib/dealmaker/proposalView";
import type { ChecksRecord, OfferRef, Proposal, ProposalRecord } from "./shapes";

const item = (row: OfferRef) => ({ itemId: row.itemId as Id<"playbookItems">, title: row.title, body: row.body });

/** The parts of a proposal that hold: needs with their quotes, and the offer items it named that exist. */
export function settled(draft: Proposal, record: ProposalRecord) {
  const quotes = new Map(record.quotes.map((row) => [row.id, row]));
  const offer = new Map(record.offer.map((row) => [row.id, row]));
  const pick = (id: string, kind: OfferRef["kind"]) => {
    const row = offer.get(id);
    return row && row.kind === kind ? row : null;
  };
  return {
    needs: draft.needs.flatMap((row) => {
      const quote = quotes.get(row.quoteId);
      return quote ? [{ need: row.need, quote: quote.quote, kind: quote.kind }] : [];
    }),
    pkg: pick(draft.packageId, "package"),
    price: pick(draft.priceId, "price"),
    guarantee: draft.guaranteeId ? pick(draft.guaranteeId, "guarantee") : null,
    proof: draft.proofIds.map((id) => pick(id, "proof")).filter((row): row is OfferRef => Boolean(row)),
  };
}

export function renderProposal(draft: Proposal, record: ProposalRecord, checks: ChecksRecord, notes: string[]) {
  const parts = settled(draft, record);
  const lines = [`# ${draft.title || `Proposal for ${record.leadName}`}`, ""];
  if (!checks.passed) {
    lines.push("## Needs review", "", "This proposal did not pass every completion check. It cannot be sent until it does:", "");
    for (const row of checks.results.filter((result) => !result.passed)) lines.push(`- **${row.name}.** ${row.detail}`);
    for (const note of notes) lines.push(`- ${note}`);
    lines.push("");
  }
  lines.push(draft.intro, "", "## What you told us", "");
  for (const row of parts.needs) lines.push(`- ${row.need} _("${row.quote}", ${row.kind})_`);
  lines.push("");
  if (parts.pkg) lines.push(`## ${parts.pkg.title}`, "", parts.pkg.body, "");
  if (draft.deliverables.length) lines.push("### What is included", "", ...draft.deliverables.map((row) => `- ${row}`), "");
  if (parts.price) lines.push("## Investment", "", `**${parts.price.title}**`, ...(parts.price.body ? ["", parts.price.body] : []), "");
  if (parts.guarantee) lines.push("## Our guarantee", "", `**${parts.guarantee.title}**`, ...(parts.guarantee.body ? ["", parts.guarantee.body] : []), "");
  if (parts.proof.length) lines.push("## Results for others", "", ...parts.proof.map((row) => `- ${row.title}${row.body ? `: ${row.body}` : ""}`), "");
  lines.push("## Next steps", "", ...draft.nextSteps.map((row, i) => `${i + 1}. ${row}`), "", draft.closing, "");
  if (record.missing.length) lines.push("---", "", "_For your team, not the lead:_", "", ...record.missing.map((row) => `- ${row}`), "");
  return lines.join("\n");
}

export function viewOf(draft: Proposal, record: ProposalRecord, checksPassed: boolean): ProposalView | null {
  const parts = settled(draft, record);
  if (!parts.pkg || !parts.price) return null;
  return {
    title: draft.title || `Proposal for ${record.leadName}`,
    intro: draft.intro,
    needs: parts.needs,
    package: item(parts.pkg),
    deliverables: draft.deliverables,
    price: item(parts.price),
    ...(parts.guarantee ? { guarantee: item(parts.guarantee) } : {}),
    proof: parts.proof.map(item),
    nextSteps: draft.nextSteps,
    closing: draft.closing,
    checksPassed,
    missing: record.missing,
  };
}
