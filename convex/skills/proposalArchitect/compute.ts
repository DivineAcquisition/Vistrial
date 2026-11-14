/**
 * Proposal Architect's record, worked out in code before the model writes: the quotes from one passing call
 * review (who said each, by the review's own labels), the Offer folder, past winning proposals as a model of
 * tone and order, the voice and the approved lessons. Ids in the prompt are short aliases.
 */

import type { ReviewView } from "../../lib/dealmaker/reviewView";
import { PROPOSAL_LIMITS, type OfferRef, type ProposalRecord, type ReviewQuote } from "./shapes";

const OFFER_ORDER: Record<string, number> = { package: 0, price: 1, guarantee: 2, proof: 3 };

export type ProposalInput = {
  proposalId: string;
  projectId: string;
  leadName: string;
  callDate: string | null;
  review: Pick<ReviewView, "outcome" | "nextStep" | "fit" | "objections" | "commitments">;
  items: { id: string; folder: string; kind: string; title: string; body: string }[];
  lessons: string[];
};

export function computeProposal(input: ProposalInput): ProposalRecord {
  const missing: string[] = [];
  const quotes: ReviewQuote[] = [];
  const add = (topic: string, quote: string, kind: string | undefined) => {
    if (!quote || quotes.some((row) => row.quote === quote)) return;
    quotes.push({ id: `q${quotes.length + 1}`, topic, quote, kind: kind ?? "Said on the call", buyer: kind === "Buyer's words" });
  };
  for (const row of input.review.fit) if (row.said) add(`${row.label}: ${row.finding}`, row.quote, row.kind);
  for (const row of input.review.objections) add(`Objection: ${row.text}`, row.quote, row.kind);
  for (const row of input.review.commitments) add(`${row.owner} will ${row.what}`, row.quote, row.kind);
  if (!quotes.some((row) => row.buyer)) missing.push("The review holds none of the lead's own words, so the proposal rests on the closer's account.");

  const offer: OfferRef[] = input.items
    .filter((row) => row.folder === "offer" && Object.hasOwn(OFFER_ORDER, row.kind))
    .sort((a, b) => OFFER_ORDER[a.kind] - OFFER_ORDER[b.kind])
    .slice(0, PROPOSAL_LIMITS.offerItems)
    .map((row, i) => ({ id: `f${i + 1}`, itemId: row.id, kind: row.kind as OfferRef["kind"], title: row.title, body: row.body.slice(0, PROPOSAL_LIMITS.offerBody) }));
  if (!offer.some((row) => row.kind === "proof")) missing.push("The Offer folder holds no proof, so the proposal names no result.");

  const winning = input.items
    .filter((row) => row.kind === "winningProposal")
    .slice(0, PROPOSAL_LIMITS.winning)
    .map((row) => ({ title: row.title, text: `${row.title}\n${row.body}`.slice(0, PROPOSAL_LIMITS.winningChars) }));
  if (!winning.length) missing.push("No past winning proposal is in the Closing folder, so the layout is Vistrial's own.");
  const voice = input.items.find((row) => row.kind === "voice");

  return {
    proposalId: input.proposalId,
    projectId: input.projectId,
    leadName: input.leadName,
    callDate: input.callDate,
    outcome: input.review.outcome,
    nextStep: input.review.nextStep,
    quotes,
    offer,
    winning,
    voice: voice ? `${voice.title}. ${voice.body}`.slice(0, 400) : null,
    lessons: input.lessons.slice(0, 12),
    missing,
    refs: {},
  };
}
