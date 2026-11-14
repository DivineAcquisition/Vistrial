/**
 * What Deal Briefing reads and works out in code, what it asks the model for, and the defensive reader that
 * turns the model's answer into typed values. docs/rebuild/dealmaker.md, sections 0.8 and 4.3.
 *
 * In the app this is "Dealmaker · pre-call brief"; the skill's name is for the landing page and Usage only.
 */

import { QUALIFICATION_FIELDS } from "../../lib/playbook";

export const SKILL_SLUG = "deal-briefing";
export const AGENT_SLUG = "sales-conversion";

/** Step names. The skill finds its own earlier steps by these. "save" matches the session page's. */
export const PHASE = {
  read: "dbRead",
  write: "write",
  check: "dbCheck",
  revise: "dbRevise",
  recheck: "dbRecheck",
  save: "save",
} as const;

export const NOT_ENOUGH_DATA = "Not enough data";

/** What one brief reads and says, at most. */
export const BRIEF_LIMITS = {
  /** This lead's earlier calls read into one brief, newest first. */
  calls: 3,
  /**
   * Characters of one call read; a longer call is cut and says so. Three calls at this length keep the worst
   * case of one write inside the brief's cap with its reserve held back (docs/rebuild/dealmaker.md, section 9).
   */
  callChars: 12_000,
  /** What a person types: the setter's hand-off, or what they know about a lead when there is no CRM. */
  noteChars: 2000,
  leadName: 80,
  /** Playbook items the model may draw on. */
  playbookItems: 40,
  cover: 5,
  objections: 5,
  commitments: 8,
  disagreements: 3,
  /** How far back and ahead a booked call is looked for. */
  appointmentDays: 30,
} as const;

/** The five fit fields readiness is read against (0.8): need, budget, who decides, timing, fit. */
export const FIT_FIELDS = QUALIFICATION_FIELDS;
export type FitField = (typeof FIT_FIELDS)[number];
export const FIT_WORDS: Record<FitField, string> = { need: "Need", budget: "Budget", decider: "Who decides", timing: "Timing", fit: "Fit with the offer" };

/**
 * The kinds of evidence Dealmaker keeps apart (doctrine 0.0). A fact is a recorded event or a measured result;
 * a quote from a call is the buyer's words; what a person typed is their own account, with their name.
 */
export type EvidenceKind = "recorded" | "buyer" | "rep" | "measured";

/** One fact read from the CRM, in code. Every fact cites the CRM source saved on the project. */
export type Fact = {
  id: string;
  group: "who" | "soFar";
  label: string;
  display: string;
  kind: "recorded" | "measured";
  /** Only for a measured result: how code worked it out. */
  formula?: string;
};

/**
 * Something the brief may quote: one of this lead's calls (the buyer's words), the setter's hand-off, or what a
 * person typed about the lead when there is no CRM (each a person's account, with their name).
 */
export type BriefSource = {
  id: string;
  type: "call" | "handoff" | "about";
  label: string;
  /** The transcript's id, for a call. */
  ref?: string;
  /** Who wrote it, for a hand-off or a note about the lead. */
  by?: string;
  text: string;
  cut: boolean;
};

/** A Playbook item the brief may draw on: a package, a price, proof, an objection, a discovery question. */
export type PlaybookRef = {
  id: string;
  folder: string;
  kind: string;
  title: string;
  body: string;
  /** The item's own evidence label (a starter objection is untested until heard on a call). */
  basis: string;
};

/** What the read step saw and worked out, saved as its record. The other steps read it from there. */
export type BriefRecord = {
  briefingId: string;
  projectId: string;
  leadName: string;
  crm: { label: string; accountName: string; currency: string; timezone: string | null } | null;
  /** The booked call this brief is for, when there is one. */
  call: { ref: string; startsAt: number; status: string } | null;
  facts: Fact[];
  sources: BriefSource[];
  playbook: PlaybookRef[];
  /** Nothing is known beyond the booking: no earlier call, no hand-off, no note. */
  firstCall: boolean;
  /** Whether the model is asked at all. With no calls, notes or Playbook offer, code writes the brief alone. */
  needsModel: boolean;
  /** What the brief could not read, worded for the closer. */
  missing: string[];
  /** The sources saved on the project, by what they are: "crm", or a source's id ("c1", "h1", "n1"). */
  refs: Record<string, string>;
};

const str = { type: "string" };
const strings = { type: "array", items: str };

export const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    summary: str,
    readiness: {
      type: "array",
      items: {
        type: "object",
        properties: { field: { type: "string", enum: [...FIT_FIELDS] }, finding: str, quote: str, sourceId: str },
        required: ["field", "finding", "quote", "sourceId"],
        additionalProperties: false,
      },
    },
    commitments: {
      type: "array",
      items: {
        type: "object",
        properties: { owner: { type: "string", enum: ["us", "lead"] }, what: str, due: str, quote: str, sourceId: str },
        required: ["owner", "what", "due", "quote", "sourceId"],
        additionalProperties: false,
      },
    },
    cover: {
      type: "array",
      items: { type: "object", properties: { point: str, refs: strings }, required: ["point", "refs"], additionalProperties: false },
    },
    objections: {
      type: "array",
      items: { type: "object", properties: { objection: str, quote: str, sourceId: str }, required: ["objection", "quote", "sourceId"], additionalProperties: false },
    },
    offerFit: { type: "object", properties: { itemId: str, why: str }, required: ["itemId", "why"], additionalProperties: false },
    disagreements: {
      type: "array",
      items: { type: "object", properties: { what: str, refs: strings }, required: ["what", "refs"], additionalProperties: false },
    },
    openingQuestion: str,
  },
  required: ["summary", "readiness", "commitments", "cover", "objections", "offerFit", "disagreements", "openingQuestion"],
  additionalProperties: false,
};

export type Readiness = { field: FitField; finding: string; quote: string; sourceId: string };
export type Commitment = { owner: "us" | "lead"; what: string; due: string; quote: string; sourceId: string };
export type CoverPoint = { point: string; refs: string[] };
export type Objection = { objection: string; quote: string; sourceId: string };
export type Disagreement = { what: string; refs: string[] };

export type Brief = {
  summary: string;
  readiness: Readiness[];
  commitments: Commitment[];
  cover: CoverPoint[];
  objections: Objection[];
  offerFit: { itemId: string; why: string };
  disagreements: Disagreement[];
  openingQuestion: string;
};

export type CheckResult = { id: number; name: string; passed: boolean; detail: string };
export type ChecksRecord = { passed: boolean; results: CheckResult[] };

function text(value: unknown, max = 600) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function list(value: unknown, max = 10): string[] {
  return Array.isArray(value) ? value.map((row) => text(row, 40)).filter(Boolean).slice(0, max) : [];
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function rows(value: unknown, max: number) {
  return (Array.isArray(value) ? value : []).slice(0, max).map(obj);
}

/** The model's answer, read defensively: a field it got wrong is dropped or emptied, never trusted. */
export function readBrief(value: unknown): Brief | null {
  if (!value || typeof value !== "object") return null;
  const row = obj(value);
  const fit = obj(row.offerFit);
  return {
    summary: text(row.summary, 900),
    readiness: rows(row.readiness, FIT_FIELDS.length * 2)
      .filter((item) => (FIT_FIELDS as readonly unknown[]).includes(item.field))
      .map((item) => ({ field: item.field as FitField, finding: text(item.finding, 300), quote: text(item.quote, 400), sourceId: text(item.sourceId, 20) })),
    commitments: rows(row.commitments, BRIEF_LIMITS.commitments)
      .filter((item) => item.owner === "us" || item.owner === "lead")
      .map((item) => ({ owner: item.owner as "us" | "lead", what: text(item.what, 300), due: text(item.due, 40), quote: text(item.quote, 400), sourceId: text(item.sourceId, 20) })),
    cover: rows(row.cover, BRIEF_LIMITS.cover + 3).map((item) => ({ point: text(item.point, 300), refs: list(item.refs) })),
    objections: rows(row.objections, BRIEF_LIMITS.objections + 3).map((item) => ({ objection: text(item.objection, 300), quote: text(item.quote, 400), sourceId: text(item.sourceId, 20) })),
    offerFit: { itemId: text(fit.itemId, 20), why: text(fit.why, 400) },
    disagreements: rows(row.disagreements, BRIEF_LIMITS.disagreements).map((item) => ({ what: text(item.what, 400), refs: list(item.refs) })),
    openingQuestion: text(row.openingQuestion, 300),
  };
}
