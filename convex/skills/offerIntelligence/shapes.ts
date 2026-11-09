/**
 * What Offer Intelligence asks the model for, as a JSON schema, and the defensive reader that turns the
 * model's answer into typed values. A field the model got wrong is dropped or emptied here, never trusted.
 */

import type { KnownItem } from "../../lib/businessContext";
import { CHANNELS, METRICS, type Channel, type Metric } from "./channels";

export const SKILL_SLUG = "offer-intelligence";

/** Approved market reports read, newest first. */
export const MAX_REPORTS = 5;

/** Sources from those reports shown to the model. */
export const MAX_SOURCES = 40;

/** Profile fields a change may name as why it fits this business. */
export const PROFILE_FIELDS = ["offer", "priceNotes", "audience", "geography", "channels", "brandVoice", "competitors"] as const;

export const CLAIM_BASIS = ["observed", "inferred", "hypothesis", "firstParty", "insufficient"] as const;
export const COMPETITOR_BASIS = ["observed", "inferred"] as const;
export const CHANGE_BASIS = ["observed", "inferred", "firstParty", "hypothesis"] as const;
export const OFFER_BASIS = ["stated", "firstParty", "insufficient"] as const;

/** The words a change uses when the business has no profile or facts on record. */
export const NO_CONTEXT_WORDS = "no business context";

const str = { type: "string" };
const strings = { type: "array", items: str };
const ids = strings;

const change = {
  type: "object",
  properties: {
    title: str,
    evidence: {
      type: "object",
      properties: { text: str, basis: { type: "string", enum: [...CHANGE_BASIS] }, sourceRefIds: ids },
      required: ["text", "basis", "sourceRefIds"],
      additionalProperties: false,
    },
    fit: {
      type: "object",
      properties: { text: str, profileFields: strings, factIds: ids, decisionIds: ids },
      required: ["text", "profileFields", "factIds", "decisionIds"],
      additionalProperties: false,
    },
    channel: { type: "string", enum: [...CHANNELS] },
    newChannel: { type: "boolean" },
    principleIds: ids,
    proposedChange: str,
    validationMethod: str,
    metric: { type: "string", enum: [...METRICS] },
  },
  required: ["title", "evidence", "fit", "channel", "newChannel", "principleIds", "proposedChange", "validationMethod", "metric"],
  additionalProperties: false,
};

export const OFFER_SCHEMA = {
  type: "object",
  properties: {
    summary: str,
    offerPosition: {
      type: "object",
      properties: { text: str, principleIds: ids },
      required: ["text", "principleIds"],
      additionalProperties: false,
    },
    currentOffer: {
      type: "object",
      properties: {
        product: str,
        price: str,
        guarantee: str,
        terms: str,
        basis: { type: "string", enum: [...OFFER_BASIS] },
        sourceRefIds: ids,
        factIds: ids,
      },
      required: ["product", "price", "guarantee", "terms", "basis", "sourceRefIds", "factIds"],
      additionalProperties: false,
    },
    competitorOffers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          competitor: str,
          offer: str,
          price: str,
          guarantee: str,
          basis: { type: "string", enum: [...COMPETITOR_BASIS] },
          sourceRefIds: ids,
        },
        required: ["competitor", "offer", "price", "guarantee", "basis", "sourceRefIds"],
        additionalProperties: false,
      },
    },
    gapsAndRisks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["gap", "risk"] },
          statement: str,
          basis: { type: "string", enum: [...CLAIM_BASIS] },
          sourceRefIds: ids,
        },
        required: ["kind", "statement", "basis", "sourceRefIds"],
        additionalProperties: false,
      },
    },
    changes: { type: "array", items: change },
    limits: strings,
    contextUsed: {
      type: "object",
      properties: { profileVersionId: { type: ["string", "null"] }, factIds: ids, reportIds: ids },
      required: ["profileVersionId", "factIds", "reportIds"],
      additionalProperties: false,
    },
  },
  required: ["summary", "offerPosition", "currentOffer", "competitorOffers", "gapsAndRisks", "changes", "limits", "contextUsed"],
  additionalProperties: false,
};

// ---------- Types and readers ----------

export type CurrentOffer = {
  product: string;
  price: string;
  guarantee: string;
  terms: string;
  basis: (typeof OFFER_BASIS)[number];
  sourceRefIds: string[];
  factIds: string[];
};

export type CompetitorOffer = {
  competitor: string;
  offer: string;
  price: string;
  guarantee: string;
  basis: (typeof COMPETITOR_BASIS)[number] | null;
  sourceRefIds: string[];
};

export type GapOrRisk = { kind: "gap" | "risk"; statement: string; basis: (typeof CLAIM_BASIS)[number] | null; sourceRefIds: string[] };

export type OfferChange = {
  title: string;
  evidence: { text: string; basis: (typeof CHANGE_BASIS)[number] | null; sourceRefIds: string[] };
  fit: { text: string; profileFields: string[]; factIds: string[]; decisionIds: string[] };
  channel: Channel | null;
  newChannel: boolean;
  principleIds: string[];
  proposedChange: string;
  validationMethod: string;
  metric: Metric | null;
};

export type OfferAnalysis = {
  summary: string;
  /** Where the offer should sit against the competition, and the playbook principles behind that. */
  offerPosition: { text: string; principleIds: string[] };
  currentOffer: CurrentOffer;
  competitorOffers: CompetitorOffer[];
  gapsAndRisks: GapOrRisk[];
  changes: OfferChange[];
  limits: string[];
  contextUsed: { profileVersionId: string | null; factIds: string[]; reportIds: string[] };
};

const MAX_TEXT = 2000;

function text(value: unknown, max = MAX_TEXT) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function list(value: unknown, max = 40): string[] {
  return Array.isArray(value) ? value.map((row) => text(row, 300)).filter(Boolean).slice(0, max) : [];
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

export function readAnalysis(value: unknown): OfferAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const row = obj(value);
  const offer = obj(row.currentOffer);
  const used = obj(row.contextUsed);
  const position = obj(row.offerPosition);
  return {
    summary: text(row.summary, 4000),
    offerPosition: { text: text(position.text), principleIds: list(position.principleIds, 6) },
    currentOffer: {
      product: text(offer.product),
      price: text(offer.price),
      guarantee: text(offer.guarantee),
      terms: text(offer.terms),
      basis: oneOf(OFFER_BASIS, offer.basis) ?? "insufficient",
      sourceRefIds: list(offer.sourceRefIds),
      factIds: list(offer.factIds),
    },
    competitorOffers: (Array.isArray(row.competitorOffers) ? row.competitorOffers : []).slice(0, 12).map((item) => {
      const competitor = obj(item);
      return {
        competitor: text(competitor.competitor, 200),
        offer: text(competitor.offer),
        price: text(competitor.price, 300),
        guarantee: text(competitor.guarantee, 300),
        basis: oneOf(COMPETITOR_BASIS, competitor.basis),
        sourceRefIds: list(competitor.sourceRefIds),
      };
    }),
    gapsAndRisks: (Array.isArray(row.gapsAndRisks) ? row.gapsAndRisks : []).slice(0, 12).map((item) => {
      const gap = obj(item);
      return { kind: gap.kind === "risk" ? "risk" : "gap", statement: text(gap.statement), basis: oneOf(CLAIM_BASIS, gap.basis), sourceRefIds: list(gap.sourceRefIds) };
    }),
    changes: (Array.isArray(row.changes) ? row.changes : []).slice(0, 5).map((item) => {
      const change = obj(item);
      const evidence = obj(change.evidence);
      const fit = obj(change.fit);
      return {
        title: text(change.title, 300),
        evidence: { text: text(evidence.text), basis: oneOf(CHANGE_BASIS, evidence.basis), sourceRefIds: list(evidence.sourceRefIds) },
        fit: { text: text(fit.text), profileFields: list(fit.profileFields), factIds: list(fit.factIds), decisionIds: list(fit.decisionIds) },
        channel: oneOf(CHANNELS, change.channel),
        newChannel: change.newChannel === true,
        principleIds: list(change.principleIds, 4),
        proposedChange: text(change.proposedChange),
        validationMethod: text(change.validationMethod),
        metric: oneOf(METRICS, change.metric),
      };
    }),
    limits: list(row.limits, 20),
    contextUsed: { profileVersionId: text(used.profileVersionId, 100) || null, factIds: list(used.factIds), reportIds: list(used.reportIds, 10) },
  };
}

/** A source as the context record keeps it. Excerpts come from outside and reach the model only wrapped. */
export type SourceLite = {
  id: string;
  platform: string;
  title: string;
  publisher: string | null;
  url: string;
  excerpt: string | null;
  /** The earlier classification's reading of the offer, marked as the model's, not a fact. */
  offerReading: string | null;
  observed: string;
  /** The channel this source shows an offer on, set in code from its platform. Null means any. */
  channel: Channel | null;
};

/** What the context step saw, saved as its record. The other steps read it from there. */
export type OfferContext = {
  /** The approved market reports this analysis builds on, newest first. */
  reports: { assetId: string; title: string; version: number; projectId: string | null; claims: string[] }[];
  /** Competitor material those reports cite. The only sources a competitor offer may cite. */
  researchSources: SourceLite[];
  /** The business's own results, saved as customerData sources. The only sources a firstParty claim may cite. */
  ownSources: SourceLite[];
  /** The research project the business's own results were saved on, or null. */
  baseProjectId: string | null;
  profile: null | {
    versionId: string;
    offer: string;
    priceNotes: string;
    audience: string;
    geography: string;
    channels: string;
    brandVoice: string;
    competitors: { name: string; url: string }[];
  };
  facts: { id: string; factKey: string; value: string; status: string; sourceType: string; recordedAt: number }[];
  /** The channels the business gets customers from, found in code, with where each was found. */
  channels: { channel: Channel; from: string }[];
  /** What the business tried before, and what happened. */
  decisions: { id: string; text: string; tried: boolean }[];
  /** The owner's own words on what they sell, at what price and on what terms, when they answered. */
  offerDetails: string;
  /** Declared gaps that block the analysis: the question keys still unanswered. */
  gaps: string[];
  known: KnownItem[];
  missing: { key: string; blocking: boolean }[];
  assumptions: string[];
};

export type CheckResult = { id: number; name: string; passed: boolean; detail: string };
export type ChecksRecord = { passed: boolean; results: CheckResult[] };

/** Step names. The skill finds its own earlier steps by these. */
export const PHASE = {
  context: "context",
  ask: "ask",
  write: "write",
  check: "check",
  revise: "revise",
  recheck: "recheck",
  save: "save",
} as const;

/** The only questions Offer Intelligence may ask: what the business sells, and where its customers come from. */
export const QUESTIONS = {
  offerDetails: "What do you sell, at what price, and with what guarantee or terms?",
  acquisitionChannels: "Where do most of your customers find you? For example: Google search, Facebook or Instagram ads, referrals, social posts, or calls and door-knocking.",
} as const;
