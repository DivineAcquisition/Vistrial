/**
 * Acting in a connected CRM, with approval: the actions that exist, which need an Owner and a typed word,
 * how each is undone, and the exact HighLevel request each one becomes. Pure, so every rule is tested
 * without HighLevel. docs/rebuild/crm-highlevel.md, section 2A.
 *
 * Nothing here deletes anything in HighLevel or reaches any endpoint not listed in `writeRequest`. Messaging a
 * lead is an action like the others, behind its own switch, the Owner's typed SEND, and the checks in
 * `messagingCheck`, run against a fresh read of the lead just before sending.
 */

import { isHlId } from "./highLevel";

export const ACTION_KINDS = ["move_stage", "set_status", "add_tag", "remove_tag", "add_note", "create_task", "send_sms", "send_email"] as const;
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
  if (kind === "set_status") return "value";
  if (isMessage(kind)) return "message";
  return null;
}

export function isMessage(kind: ActionKind): kind is "send_sms" | "send_email" {
  return kind === "send_sms" || kind === "send_email";
}

/** Actions that may start a workflow the business set up in HighLevel, which may message the lead. */
export function mayTriggerAutomation(kind: ActionKind) {
  // A message is itself a message to the lead: its own warning says so, and its checks run before sending.
  return kind === "move_stage" || kind === "set_status" || kind === "add_tag" || kind === "remove_tag" || kind === "create_task";
}

/** A proposal nobody decides in this long expires. Silence approves nothing. */
export const PROPOSAL_HOURS = 24;

export const LIMITS = { tag: 60, note: 2000, taskTitle: 200, taskBody: 2000, why: 300, sms: 640, subject: 150, email: 5000 } as const;

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
  if (!(ACTION_KINDS as readonly string[]).includes(input.kind)) return { ok: false, reason: "That is not an action Vistrial can take." };
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
    case "send_sms": {
      const body = (input.body ?? "").trim();
      if (!body || body.length > LIMITS.sms) return { ok: false, reason: `A text is 1 to ${LIMITS.sms} characters.` };
      return { ok: true, value: { kind: input.kind, contactId: input.contactId, body } };
    }
    case "send_email": {
      const title = clean(input.title, LIMITS.subject);
      const body = (input.body ?? "").trim();
      if (!title || title.length > LIMITS.subject) return { ok: false, reason: `An email subject is 1 to ${LIMITS.subject} characters.` };
      if (!body || body.length > LIMITS.email) return { ok: false, reason: `An email is 1 to ${LIMITS.email} characters.` };
      return { ok: true, value: { kind: input.kind, contactId: input.contactId, title, body } };
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
    case "send_sms":
      if (!isHlId(contact) || !action.body) throw new Error("bad text");
      return { method: "POST", path: "/conversations/messages", body: { type: "SMS", contactId: contact, message: action.body } };
    case "send_email":
      if (!isHlId(contact) || !action.title || !action.body) throw new Error("bad email");
      return { method: "POST", path: "/conversations/messages", body: { type: "Email", contactId: contact, subject: action.title, message: action.body, html: emailHtml(action.body) } };
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
    ["POST", /^\/conversations\/messages$/],
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
    case "send_sms":
      return "HighLevel: text a lead";
    case "send_email":
      return `HighLevel: email a lead: "${action.title}"`;
  }
}

/** Plain text as safe HTML paragraphs, for the email body. */
export function emailHtml(text: string) {
  const escape = (line: string) => line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${block.split("\n").map(escape).join("<br>")}</p>`)
    .join("");
}

// ---------- Messaging a lead: the checks before every send ----------

/** Quiet hours in the lead's own time: no message from 8 pm until 8 am. */
export const QUIET_HOURS = { from: 20, until: 8 } as const;

/** At most one message from Vistrial to the same lead in this long. */
export const MESSAGE_GAP_HOURS = 24;

/** The hour of day (0 to 23) in a time zone, or null when the zone is not a real one. */
export function localHour(timeZone: string | null | undefined, at: number): number | null {
  if (!timeZone) return null;
  try {
    const hour = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(new Date(at));
    const value = Number(hour);
    return Number.isInteger(value) && value >= 0 && value < 24 ? value : null;
  } catch {
    return null;
  }
}

/** What a fresh read of the lead says about reaching them. From `GET /contacts/{id}`. */
export type Reachability = {
  phone: string | null;
  email: string | null;
  timezone: string | null;
  /** HighLevel's all-channel Do Not Disturb. */
  dnd: boolean;
  /** DND for this channel, from `dndSettings`. */
  channelDnd: boolean;
};

export function reachabilityOf(body: unknown, channel: "SMS" | "Email"): Reachability | null {
  const outer = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const contact = outer?.contact && typeof outer.contact === "object" ? (outer.contact as Record<string, unknown>) : outer;
  if (!contact || typeof contact.id !== "string") return null;
  const settings = contact.dndSettings && typeof contact.dndSettings === "object" ? (contact.dndSettings as Record<string, unknown>) : {};
  const forChannel = settings[channel] && typeof settings[channel] === "object" ? (settings[channel] as Record<string, unknown>) : null;
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  return {
    phone: text(contact.phone),
    email: text(contact.email),
    timezone: text(contact.timezone),
    dnd: contact.dnd === true,
    // HighLevel marks a channel's DND "active" when the lead must not be contacted there. Anything but a clear "inactive" counts as on.
    channelDnd: forChannel !== null && forChannel.status !== "inactive",
  };
}

export type MessageCheck =
  | { ok: true; timezone: string; localHour: number }
  | { ok: false; code: "opted_out" | "no_address" | "no_timezone" | "quiet_hours" | "unreadable"; reason: string };

/**
 * Every check a message must pass at the moment it is sent. Any failure refuses the send. The customer is
 * responsible for having the lead's consent (TCPA for texts, CAN-SPAM for email); these checks keep Vistrial
 * from sending where the lead has opted out, has no address, or it is night where they are.
 */
export function messagingCheck(input: { reach: Reachability | null; channel: "SMS" | "Email"; locationTimezone: string | null; now: number }): MessageCheck {
  const { reach } = input;
  if (!reach) return { ok: false, code: "unreadable", reason: "HighLevel did not return the lead, so nothing was sent." };
  if (reach.dnd || reach.channelDnd) return { ok: false, code: "opted_out", reason: "The lead is on Do Not Disturb or opted out in HighLevel. Nothing was sent." };
  if (input.channel === "SMS" ? !reach.phone : !reach.email) return { ok: false, code: "no_address", reason: `The lead has no ${input.channel === "SMS" ? "phone number" : "email address"} in HighLevel.` };
  const timezone = reach.timezone ?? input.locationTimezone;
  const hour = localHour(timezone, input.now);
  if (hour === null || !timezone) return { ok: false, code: "no_timezone", reason: "The lead's local time is not known, so quiet hours cannot be checked. Nothing was sent." };
  if (hour >= QUIET_HOURS.from || hour < QUIET_HOURS.until) {
    return { ok: false, code: "quiet_hours", reason: `It is ${hour}:00 where the lead is; messages go out only between 8 am and 8 pm their time. Nothing was sent.` };
  }
  return { ok: true, timezone, localHour: hour };
}
