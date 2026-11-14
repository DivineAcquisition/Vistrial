/**
 * Acting in a connected CRM, with approval: the actions that exist, which need an Owner and a typed word,
 * how each is undone, and the exact HighLevel request each one becomes. Pure, so every rule is tested
 * without HighLevel. docs/rebuild/crm-highlevel.md, section 2A.
 *
 * Nothing here deletes anything in HighLevel, sends a message, or reaches any endpoint not listed in
 * `writeRequest`. Messaging leads is designed but not built.
 */

import { isHlId } from "./highLevel";

export const ACTION_KINDS = ["move_stage", "set_status", "add_tag", "remove_tag", "add_note", "create_task"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const DEAL_STATUSES = ["open", "won", "lost", "abandoned"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

/** Why an action is the Owner's alone, and the word they type to approve it. */
export const RESTRICTED = {
  value: { word: "VALUE", why: "It changes a deal's outcome, and so the revenue your team reports." },
  message: { word: "SEND", why: "It sends a message to a person." },
} as const;
export type Restriction = keyof typeof RESTRICTED;

/** The Owner-only actions. Everything else is an Owner's or Admin's decision. */
export function restrictionOf(kind: ActionKind): Restriction | null {
  return kind === "set_status" ? "value" : null;
}

/** Actions that may start a workflow the business set up in HighLevel, which may message the lead. */
export function mayTriggerAutomation(kind: ActionKind) {
  return kind === "move_stage" || kind === "set_status" || kind === "add_tag" || kind === "remove_tag" || kind === "create_task";
}

/** A proposal nobody decides in this long expires. Silence approves nothing. */
export const PROPOSAL_HOURS = 24;

export const LIMITS = { tag: 60, note: 2000, taskTitle: 200, taskBody: 2000, why: 300 } as const;

export type ActionInput = {
  kind: ActionKind;
  dealId?: string;
  contactId?: string;
  pipelineId?: string;
  stageId?: string;
  status?: string;
  tag?: string;
  title?: string;
  body?: string;
  dueAt?: number;
};

const clean = (text: string | undefined, max: number) => (text ?? "").replace(/\s+/g, " ").trim().slice(0, max + 1);

/**
 * The fields an action needs, checked and trimmed. Returns the reason in plain words when it is not a valid
 * action. It does not check that the deal or lead exists in the connected sub-account; the caller does.
 */
export function checkInput(input: ActionInput, now: number): { ok: true; value: ActionInput } | { ok: false; reason: string } {
  const needDeal = input.kind === "move_stage" || input.kind === "set_status";
  if (needDeal ? !isHlId(input.dealId) : !isHlId(input.contactId)) return { ok: false, reason: needDeal ? "Choose a deal." : "Choose a lead." };
  switch (input.kind) {
    case "move_stage":
      if (!isHlId(input.stageId)) return { ok: false, reason: "Choose the stage to move it to." };
      return { ok: true, value: { kind: input.kind, dealId: input.dealId, stageId: input.stageId } };
    case "set_status":
      if (!(DEAL_STATUSES as readonly string[]).includes(input.status ?? "")) return { ok: false, reason: "Choose won, lost, abandoned or open." };
      return { ok: true, value: { kind: input.kind, dealId: input.dealId, status: input.status } };
    case "add_tag":
    case "remove_tag": {
      const tag = clean(input.tag, LIMITS.tag);
      if (!tag || tag.length > LIMITS.tag) return { ok: false, reason: `A tag is 1 to ${LIMITS.tag} characters.` };
      return { ok: true, value: { kind: input.kind, contactId: input.contactId, tag } };
    }
    case "add_note": {
      const body = (input.body ?? "").trim();
      if (!body || body.length > LIMITS.note) return { ok: false, reason: `A note is 1 to ${LIMITS.note} characters.` };
      return { ok: true, value: { kind: input.kind, contactId: input.contactId, body } };
    }
    case "create_task": {
      const title = clean(input.title, LIMITS.taskTitle);
      const body = (input.body ?? "").trim();
      if (!title || title.length > LIMITS.taskTitle) return { ok: false, reason: `A task title is 1 to ${LIMITS.taskTitle} characters.` };
      if (body.length > LIMITS.taskBody) return { ok: false, reason: `Task details are at most ${LIMITS.taskBody} characters.` };
      if (typeof input.dueAt !== "number" || !Number.isFinite(input.dueAt) || input.dueAt < now - 60_000 || input.dueAt > now + 366 * 86_400_000) {
        return { ok: false, reason: "Give the task a due date within the next year." };
      }
      return { ok: true, value: { kind: input.kind, contactId: input.contactId, title, body: body || undefined, dueAt: input.dueAt } };
    }
  }
}

/**
 * The one HighLevel request an approved action becomes. The only writes Vistrial ever sends: every path is
 * built here from checked ids, and the sender refuses anything that did not come from this function.
 */
export function writeRequest(action: ActionInput & { pipelineId?: string }): { method: "PUT" | "POST" | "DELETE"; path: string; body: Record<string, unknown> } {
  const deal = action.dealId;
  const contact = action.contactId;
  switch (action.kind) {
    case "move_stage":
      if (!isHlId(deal) || !isHlId(action.pipelineId) || !isHlId(action.stageId)) throw new Error("bad move");
      return { method: "PUT", path: `/opportunities/${deal}`, body: { pipelineId: action.pipelineId, pipelineStageId: action.stageId } };
    case "set_status":
      if (!isHlId(deal) || !(DEAL_STATUSES as readonly string[]).includes(action.status ?? "")) throw new Error("bad status");
      return { method: "PUT", path: `/opportunities/${deal}/status`, body: { status: action.status } };
    case "add_tag":
    case "remove_tag":
      if (!isHlId(contact) || !action.tag) throw new Error("bad tag");
      return { method: action.kind === "add_tag" ? "POST" : "DELETE", path: `/contacts/${contact}/tags`, body: { tags: [action.tag] } };
    case "add_note":
      if (!isHlId(contact) || !action.body) throw new Error("bad note");
      return { method: "POST", path: `/contacts/${contact}/notes`, body: { body: action.body } };
    case "create_task":
      if (!isHlId(contact) || !action.title || typeof action.dueAt !== "number") throw new Error("bad task");
      return {
        method: "POST",
        path: `/contacts/${contact}/tasks`,
        body: { title: action.title, ...(action.body ? { body: action.body } : {}), dueDate: new Date(action.dueAt).toISOString(), completed: false },
      };
  }
}

/** A path the sender may write to. Anything else is refused before it leaves the server. */
export function isAllowedWrite(method: string, path: string) {
  const id = "[A-Za-z0-9_-]{2,64}";
  const rules: [string, RegExp][] = [
    ["PUT", new RegExp(`^/opportunities/${id}$`)],
    ["PUT", new RegExp(`^/opportunities/${id}/status$`)],
    ["POST", new RegExp(`^/contacts/${id}/tags$`)],
    ["DELETE", new RegExp(`^/contacts/${id}/tags$`)],
    ["POST", new RegExp(`^/contacts/${id}/notes$`)],
    ["POST", new RegExp(`^/contacts/${id}/tasks$`)],
  ];
  return rules.some(([verb, pattern]) => verb === method && pattern.test(path));
}

/** What was there before, so the action can be undone. */
export type Before = { pipelineId?: string; stageId?: string; status?: string };

/** The action that reverses a done one, or null when Vistrial cannot undo it (a note, a task). */
export function reverseOf(action: ActionInput, before: Before | undefined): ActionInput | null {
  switch (action.kind) {
    case "move_stage":
      return before?.stageId ? { kind: "move_stage", dealId: action.dealId, stageId: before.stageId, pipelineId: before.pipelineId } : null;
    case "set_status":
      return before?.status ? { kind: "set_status", dealId: action.dealId, status: before.status } : null;
    case "add_tag":
      return { kind: "remove_tag", contactId: action.contactId, tag: action.tag };
    case "remove_tag":
      return { kind: "add_tag", contactId: action.contactId, tag: action.tag };
    default:
      return null;
  }
}

const STATUS_WORDS: Record<string, string> = { open: "open", won: "won", lost: "lost", abandoned: "abandoned" };

/**
 * The action in a line, for the approvals queue. It names stages, tags and statuses, not the lead: the
 * queue outlives the connection, and the lead's name is shown from the CRM data while it exists.
 */
export function summaryOf(action: ActionInput, words: { fromStage?: string; toStage?: string; fromStatus?: string }) {
  switch (action.kind) {
    case "move_stage":
      return `HighLevel: move a deal from ${words.fromStage ?? "its stage"} to ${words.toStage ?? "another stage"}`;
    case "set_status":
      return `HighLevel: mark a deal ${STATUS_WORDS[action.status ?? ""] ?? action.status}${words.fromStatus ? ` (now ${STATUS_WORDS[words.fromStatus] ?? words.fromStatus})` : ""}`;
    case "add_tag":
      return `HighLevel: add the tag "${action.tag}" to a lead`;
    case "remove_tag":
      return `HighLevel: remove the tag "${action.tag}" from a lead`;
    case "add_note":
      return "HighLevel: add a note to a lead";
    case "create_task":
      return `HighLevel: create the task "${action.title}" on a lead`;
  }
}
