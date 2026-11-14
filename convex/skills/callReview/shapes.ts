/**
 * What Conversation Intelligence reads and works out in code, what it asks the model for, and the defensive
 * reader for the model's answer. In the app this is "Dealmaker · call review". docs/rebuild/dealmaker.md, 0.8, 4.2.
 */

import { QUALIFICATION_FIELDS } from "../../lib/playbook";

export const SKILL_SLUG = "conversation-intelligence";
export const AGENT_SLUG = "sales-conversion";

export const PHASE = { read: "crRead", write: "write", check: "crCheck", revise: "crRevise", recheck: "crRecheck", save: "save" } as const;

export const NOT_ENOUGH_DATA = "Not enough data";

export const REVIEW_LIMITS = {
  /**
   * Characters of the transcript read; a longer call is cut and says so (about 45 minutes of talk). At this
   * length the worst case of one write fits the review's cap with its reserve held back (section 9).
   */
  transcriptChars: 42_000,
  notesChars: 8000,
  playbookItems: 40,
  objections: 8,
  commitments: 10,
  coaching: 3,
  recapWords: 150,
  leadName: 80,
} as const;

export const FIT_FIELDS = QUALIFICATION_FIELDS;
export type FitField = (typeof FIT_FIELDS)[number];
export const FIT_WORDS: Record<FitField, string> = { need: "Need", budget: "Budget", decider: "Who decides", timing: "Timing", fit: "Fit with the offer" };

/** One speaker's share of the call, worked out in code from the transcript's own speaker labels. */
export type Speaker = { name: string; words: number; share: number; questions: number };

/** What the review may quote: the call itself (the buyer's words), or the closer's notes and memo (their account). */
export type ReviewSource = { id: string; type: "call" | "notes"; label: string; by?: string; text: string; cut: boolean };

export type PlaybookRef = { id: string; folder: string; kind: string; stage: string | null; title: string; body: string; basis: string; /** The item's own id, kept out of the prompt. */ itemId?: string };

/** What the read step saw and worked out, saved as its record. */
export type ReviewRecord = {
  reviewId: string;
  projectId: string;
  leadName: string;
  callDate: string | null;
  crm: { label: string; accountName: string; currency: string } | null;
  deal: { ref: string; pipelineRef: string; stageRef: string; status: string; value: number } | null;
  /** The deal's pipeline, stages in order, for a proposed move. */
  stages: { ref: string; name: string }[];
  contactRef: string | null;
  sources: ReviewSource[];
  playbook: PlaybookRef[];
  /** Talk time and questions per speaker; null when the transcript names fewer than two speakers. */
  talk: Speaker[] | null;
  missing: string[];
  refs: Record<string, string>;
};

const str = { type: "string" };

export const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    outcome: str,
    nextStep: str,
    fit: { type: "array", items: { type: "object", properties: { field: { type: "string", enum: [...FIT_FIELDS] }, finding: str, quote: str, sourceId: str }, required: ["field", "finding", "quote", "sourceId"], additionalProperties: false } },
    objections: {
      type: "array",
      items: { type: "object", properties: { objection: str, itemId: str, quote: str, sourceId: str, answered: { type: "boolean" }, answerQuote: str }, required: ["objection", "itemId", "quote", "sourceId", "answered", "answerQuote"], additionalProperties: false },
    },
    commitments: {
      type: "array",
      items: { type: "object", properties: { owner: { type: "string", enum: ["us", "lead"] }, what: str, due: str, quote: str, sourceId: str }, required: ["owner", "what", "due", "quote", "sourceId"], additionalProperties: false },
    },
    coverage: { type: "array", items: { type: "object", properties: { itemId: str, quote: str }, required: ["itemId", "quote"], additionalProperties: false } },
    stage: { type: "object", properties: { stageRef: str, why: str }, required: ["stageRef", "why"], additionalProperties: false },
    decision: { type: "object", properties: { status: { type: "string", enum: ["won", "lost", ""] }, quote: str }, required: ["status", "quote"], additionalProperties: false },
    coaching: { type: "array", items: str },
    recap: { type: "object", properties: { subject: str, body: str }, required: ["subject", "body"], additionalProperties: false },
  },
  required: ["outcome", "nextStep", "fit", "objections", "commitments", "coverage", "stage", "decision", "coaching", "recap"],
  additionalProperties: false,
};

export type Fit = { field: FitField; finding: string; quote: string; sourceId: string };
/** `itemId` is the Playbook objection it is, by its id in the prompt ("p3"), or "". */
export type Objection = { objection: string; itemId: string; quote: string; sourceId: string; answered: boolean; answerQuote: string };
export type Commitment = { owner: "us" | "lead"; what: string; due: string; quote: string; sourceId: string };

export type Review = {
  outcome: string;
  nextStep: string;
  fit: Fit[];
  objections: Objection[];
  commitments: Commitment[];
  coverage: { itemId: string; quote: string }[];
  stage: { stageRef: string; why: string };
  decision: { status: "won" | "lost" | ""; quote: string };
  coaching: string[];
  recap: { subject: string; body: string };
};

export type CheckResult = { id: number; name: string; passed: boolean; detail: string };
export type ChecksRecord = { passed: boolean; results: CheckResult[] };

function text(value: unknown, max = 600) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}
function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function rows(value: unknown, max: number) {
  return (Array.isArray(value) ? value : []).slice(0, max).map(obj);
}

/** The model's answer, read defensively: a field it got wrong is dropped or emptied, never trusted. */
export function readReview(value: unknown): Review | null {
  if (!value || typeof value !== "object") return null;
  const row = obj(value);
  const stage = obj(row.stage);
  const decision = obj(row.decision);
  const recap = obj(row.recap);
  const status = decision.status === "won" || decision.status === "lost" ? decision.status : "";
  return {
    outcome: text(row.outcome, 400),
    nextStep: text(row.nextStep, 300),
    fit: rows(row.fit, FIT_FIELDS.length * 2)
      .filter((item) => (FIT_FIELDS as readonly unknown[]).includes(item.field))
      .map((item) => ({ field: item.field as FitField, finding: text(item.finding, 300), quote: text(item.quote, 400), sourceId: text(item.sourceId, 10) })),
    objections: rows(row.objections, REVIEW_LIMITS.objections + 4).map((item) => ({ objection: text(item.objection, 300), itemId: text(item.itemId, 10), quote: text(item.quote, 400), sourceId: text(item.sourceId, 10), answered: item.answered === true, answerQuote: text(item.answerQuote, 400) })),
    commitments: rows(row.commitments, REVIEW_LIMITS.commitments + 4)
      .filter((item) => item.owner === "us" || item.owner === "lead")
      .map((item) => ({ owner: item.owner as "us" | "lead", what: text(item.what, 300), due: text(item.due, 20), quote: text(item.quote, 400), sourceId: text(item.sourceId, 10) })),
    coverage: rows(row.coverage, REVIEW_LIMITS.playbookItems).map((item) => ({ itemId: text(item.itemId, 10), quote: text(item.quote, 400) })),
    stage: { stageRef: text(stage.stageRef, 100), why: text(stage.why, 300) },
    decision: { status, quote: text(decision.quote, 400) },
    coaching: (Array.isArray(row.coaching) ? row.coaching : []).map((item) => text(item, 300)).filter(Boolean).slice(0, REVIEW_LIMITS.coaching + 2),
    recap: { subject: text(recap.subject, 120), body: typeof recap.body === "string" ? recap.body.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim().slice(0, 2000) : "" },
  };
}
