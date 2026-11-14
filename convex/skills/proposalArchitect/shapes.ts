/**
 * What Proposal Architect reads and works out in code, what it asks the model for, and the defensive reader for
 * the model's answer. In the app this is "Dealmaker · proposal". docs/rebuild/dealmaker.md, 0.8 and 4.5.
 *
 * A proposal is built from one passing call review (the lead's own words) and the Offer folder. It never sets or
 * changes a price: the model picks the price item; its words are copied from the Offer folder in code.
 */

export const SKILL_SLUG = "proposal-architect";
export const AGENT_SLUG = "sales-conversion";

export const PHASE = { read: "paRead", write: "write", check: "paCheck", revise: "paRevise", recheck: "paRecheck", save: "save" } as const;

export const PROPOSAL_LIMITS = {
  needs: 6,
  deliverables: 10,
  nextSteps: 5,
  introWords: 90,
  closingWords: 60,
  offerItems: 30,
  offerBody: 1200,
  /** Characters of each past winning proposal shown as a model of tone and order, never of content. */
  winningChars: 1500,
  winning: 2,
  leadName: 80,
} as const;

/** A quote from the call review the proposal may stand on: the buyer's words, a rep's words, or the closer's account. */
export type ReviewQuote = { id: string; topic: string; quote: string; kind: string; buyer: boolean };

/** An Offer folder item the proposal may name. */
export type OfferRef = { id: string; itemId: string; kind: "package" | "price" | "guarantee" | "proof"; title: string; body: string };

export type ProposalRecord = {
  proposalId: string;
  projectId: string;
  leadName: string;
  callDate: string | null;
  /** How the call ended and the next step, as the review read them (Inference). */
  outcome: string;
  nextStep: string;
  quotes: ReviewQuote[];
  offer: OfferRef[];
  winning: { title: string; text: string }[];
  voice: string | null;
  lessons: string[];
  missing: string[];
  refs: Record<string, string>;
};

export type Proposal = {
  title: string;
  intro: string;
  needs: { need: string; quoteId: string }[];
  packageId: string;
  deliverables: string[];
  priceId: string;
  guaranteeId: string;
  proofIds: string[];
  nextSteps: string[];
  closing: string;
};

export type CheckResult = { id: number; name: string; passed: boolean; detail: string };
export type ChecksRecord = { passed: boolean; results: CheckResult[] };

const str = { type: "string" };

export const PROPOSAL_SCHEMA = {
  type: "object",
  properties: {
    title: str,
    intro: str,
    needs: { type: "array", items: { type: "object", properties: { need: str, quoteId: str }, required: ["need", "quoteId"], additionalProperties: false } },
    packageId: str,
    deliverables: { type: "array", items: str },
    priceId: str,
    guaranteeId: str,
    proofIds: { type: "array", items: str },
    nextSteps: { type: "array", items: str },
    closing: str,
  },
  required: ["title", "intro", "needs", "packageId", "deliverables", "priceId", "guaranteeId", "proofIds", "nextSteps", "closing"],
  additionalProperties: false,
};

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}
function list(value: unknown, max: number, each: number) {
  return (Array.isArray(value) ? value : []).slice(0, max).map((item) => text(item, each)).filter(Boolean);
}

/** The model's answer, read defensively: a field it got wrong is dropped or emptied, never trusted. */
export function readProposal(value: unknown): Proposal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return {
    title: text(row.title, 120),
    intro: text(row.intro, 1200),
    needs: (Array.isArray(row.needs) ? row.needs : []).slice(0, PROPOSAL_LIMITS.needs + 3).flatMap((item) => (item && typeof item === "object" ? [{ need: text((item as Record<string, unknown>).need, 300), quoteId: text((item as Record<string, unknown>).quoteId, 10) }] : [])),
    packageId: text(row.packageId, 10),
    deliverables: list(row.deliverables, PROPOSAL_LIMITS.deliverables + 4, 300),
    priceId: text(row.priceId, 10),
    guaranteeId: text(row.guaranteeId, 10),
    proofIds: list(row.proofIds, 6, 10),
    nextSteps: list(row.nextSteps, PROPOSAL_LIMITS.nextSteps + 3, 300),
    closing: text(row.closing, 800),
  };
}
