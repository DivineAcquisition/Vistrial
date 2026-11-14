/**
 * Follow-up Engine (docs/rebuild/dealmaker.md, 0.8 and 4.4): finds the deals that need one next message, in
 * code, from the same board the Pipeline tab shows, then drafts each message once and checks it in code. It
 * files drafts only; sending goes through Comms and the approvals path.
 */

import type { MessageKind } from "../../lib/dealmaker/autonomy";

export const SKILL_SLUG = "follow-up-engine";
export const AGENT_SLUG = "sales-conversion";

export const PHASE = { scan: "fuScan", write: "fuWrite", check: "fuCheck", save: "save" } as const;

/** Drafts one run writes at most. */
export const MAX_DRAFTS = 10;

/** The board's next move decides the kind of message, never the model (lib/dealmaker/board.ts). */
export const TRIGGERS = {
  answer: { kind: "answer", why: "The lead wrote last, so the reply is ours." },
  deliver: { kind: "deliverPromised", why: "Something we promised is due." },
  confirm: { kind: "confirmation", why: "A booked call is coming up; confirm it." },
  rebook: { kind: "followUp", why: "The lead missed a booked call." },
  checkIn: { kind: "checkIn", why: "The deal has gone quiet; ask honestly whether more contact is welcome." },
  firstReply: { kind: "firstMessage", why: "A new lead nobody has written to yet." },
} as const satisfies Record<string, { kind: MessageKind; why: string }>;
export type Trigger = keyof typeof TRIGGERS;

export type Candidate = {
  id: string;
  dealRef: string;
  contactRef: string;
  firstName: string | null;
  trigger: Trigger;
  channel: "sms" | "email";
  stage: string;
  context: string[];
};

export type ScanRecord = {
  candidates: Candidate[];
  voice: string[];
  lessons: string[];
  offer: string[];
  proof: string[];
  skipped: string[];
};

const str = { type: "string" };

export const WRITE_SCHEMA = {
  type: "object",
  properties: {
    drafts: {
      type: "array",
      items: {
        type: "object",
        properties: { id: str, subject: str, body: str },
        required: ["id", "subject", "body"],
        additionalProperties: false,
      },
    },
  },
  required: ["drafts"],
  additionalProperties: false,
};

export type Written = { id: string; subject: string; body: string };

export function readWritten(value: unknown): Written[] {
  const drafts = (value as { drafts?: unknown })?.drafts;
  if (!Array.isArray(drafts)) return [];
  const text = (row: Record<string, unknown>, key: string) => (typeof row[key] === "string" ? (row[key] as string).trim() : "");
  return drafts.filter((row): row is Record<string, unknown> => !!row && typeof row === "object").map((row) => ({ id: text(row, "id"), subject: text(row, "subject"), body: text(row, "body") }));
}

export type CheckedDraft = Written & { passed: boolean; why: string };
