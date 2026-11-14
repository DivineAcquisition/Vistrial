/**
 * Dealmaker's Comms (build step 13a): every message drafted for a lead, in lanes (drafted, held, waiting for
 * approval, sent, failed). A draft is edited freely until it is proposed; proposing runs Dealmaker's own
 * checks first (a paused lead is held; the lead must carry a consent tag when the business set any; a price
 * or a first message always needs a person) and then goes through the existing approvals path
 * (lib/crm/act.ts), where the Owner's SEND, quiet hours, Do Not Disturb and the one-a-day rule still apply.
 * Nothing here sends anything itself.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { clientForNew, clientHere, type ClientScope } from "./lib/clients";
import { proposeCrmAction } from "./lib/crm/act";
import { crmConnectionFor } from "./lib/crm/read";
import { notFound, userError } from "./lib/errors";
import { MESSAGE_KINDS, MESSAGE_KIND_LABEL, decideSend, hasPrice, type MessageKind } from "./lib/dealmaker/autonomy";
import { SALES_CONVERSION } from "./catalog";
import { FAILURE_WORDS, approveByStandingSwitch } from "./crmActions";
import { isPaused } from "./dealmakerTeam";
import { settingsOf } from "./playbookInterview";

type Ctx = QueryCtx & { workspaceId: Id<"workspaces">; clients: ClientScope };
type Scope = { workspaceId: Id<"workspaces">; clientId?: Id<"clients"> };

export const COMMS_LIMITS = { sms: 640, title: 150, email: 5000, why: 300 } as const;
export const LANES = ["drafted", "held", "waiting", "sent", "failed"] as const;
export type Lane = (typeof LANES)[number];
export const LANE_LABEL: Record<Lane, string> = { drafted: "Drafted", held: "Held", waiting: "Waiting for approval", sent: "Sent", failed: "Not sent" };

export const COMMS_TEXT = {
  noConsent: "This lead has none of your consent tags, so Dealmaker will not propose a message to them.",
  empty: "Write the message.",
  noSubject: "An email needs a subject.",
  notEditable: "This message has already been proposed, so it can no longer be edited.",
  badKind: "Choose what kind of message this is.",
} as const;

const kindValidator = v.string();
const channel = v.union(v.literal("sms"), v.literal("email"));

async function readScope(ctx: Ctx, clientId: Id<"clients"> | undefined): Promise<Scope> {
  if (!clientId) {
    ctx.clients.require(undefined);
    return { workspaceId: ctx.workspaceId };
  }
  const client = await clientHere(ctx, ctx.workspaceId, clientId);
  ctx.clients.require(client._id);
  return { workspaceId: ctx.workspaceId, clientId: client._id };
}

function laneOf(draft: Doc<"dealmakerDrafts">, action: Doc<"crmActions"> | null): Lane {
  if (draft.status === "draft") return "drafted";
  if (draft.status === "held") return "held";
  if (!action) return "failed";
  if (action.state === "done") return "sent";
  if (action.state === "proposed" || action.state === "approved" || action.state === "running") return "waiting";
  return "failed";
}

function failureOf(action: Doc<"crmActions"> | null) {
  if (!action) return "The proposal is gone.";
  if (action.state === "declined") return "A person declined it.";
  if (action.state === "expired") return "Nobody decided within a day, so it expired.";
  if (action.state === "cancelled") return "Messaging or acting was switched off before it went.";
  return FAILURE_WORDS[action.resultCode ?? ""] ?? "It could not be sent.";
}

/** Every message for this organization or client, in its lane. */
export const view = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const scope = await readScope(ctx, args.clientId);
    const rows: Doc<"dealmakerDrafts">[] = [];
    for (const status of ["draft", "held", "proposed"] as const) {
      rows.push(
        ...(await ctx.db
          .query("dealmakerDrafts")
          .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", status))
          .order("desc")
          .take(200)),
      );
    }
    const mine = rows.filter((row) => row.clientId === scope.clientId);
    const items = await Promise.all(
      mine.map(async (row) => {
        const action = row.actionId ? await ctx.db.get(row.actionId) : null;
        const lane = laneOf(row, action);
        return {
          id: row._id,
          lane,
          contactRef: row.contactRef,
          dealRef: row.dealRef ?? null,
          kind: row.kind,
          kindLabel: MESSAGE_KIND_LABEL[row.kind as MessageKind] ?? "Message",
          channel: row.channel,
          title: row.title ?? null,
          body: row.body,
          why: row.why,
          byDealmaker: row.createdBy === "agent",
          note: lane === "failed" ? failureOf(action) : lane === "held" || lane === "drafted" ? (row.reason ?? null) : null,
          updatedAt: action?.doneAt ?? row.updatedAt,
        };
      }),
    );
    return {
      lanes: LANES.map((id) => ({ id, label: LANE_LABEL[id], items: items.filter((row) => row.lane === id).sort((a, b) => b.updatedAt - a.updatedAt) })),
      kinds: MESSAGE_KINDS.map((id) => ({ id, label: MESSAGE_KIND_LABEL[id] })),
      canEdit: ctx.role !== "viewer",
    };
  },
});

function checkBody(input: { channel: "sms" | "email"; title?: string; body: string }) {
  const body = input.body.trim().slice(0, input.channel === "sms" ? COMMS_LIMITS.sms : COMMS_LIMITS.email);
  if (!body) throw userError(COMMS_TEXT.empty);
  const title = input.channel === "email" ? (input.title ?? "").replace(/\s+/g, " ").trim().slice(0, COMMS_LIMITS.title) : undefined;
  if (input.channel === "email" && !title) throw userError(COMMS_TEXT.noSubject);
  return { body, ...(title ? { title } : {}) };
}

/** A person drafts a message to a lead. */
export const createDraft = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")), contactRef: v.string(), dealRef: v.optional(v.string()), kind: kindValidator, channel, title: v.optional(v.string()), body: v.string(), why: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const forClient = await clientForNew(ctx, args.clientId);
    if (!(MESSAGE_KINDS as readonly string[]).includes(args.kind)) throw userError(COMMS_TEXT.badKind);
    const now = Date.now();
    const id = await ctx.db.insert("dealmakerDrafts", {
      workspaceId: ctx.workspaceId,
      ...forClient,
      contactRef: args.contactRef.slice(0, 100),
      ...(args.dealRef ? { dealRef: args.dealRef.slice(0, 100) } : {}),
      kind: args.kind,
      channel: args.channel,
      ...checkBody(args),
      why: (args.why ?? "Written by a person.").replace(/\s+/g, " ").trim().slice(0, COMMS_LIMITS.why),
      trigger: "person",
      status: "draft",
      createdBy: ctx.identity.subject,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "dealmaker.draft_created", subject: id });
    return id;
  },
});

async function editable(ctx: Ctx, id: Id<"dealmakerDrafts">) {
  const row = await ctx.db.get(id);
  if (!row || row.workspaceId !== ctx.workspaceId || row.status === "discarded") notFound();
  ctx.clients.require(row.clientId);
  if (row.status === "proposed") throw userError(COMMS_TEXT.notEditable);
  return row;
}

/** Edits a draft or a held message. The person's words replace Dealmaker's. */
export const updateDraft = workspaceMutation({
  args: { draftId: v.id("dealmakerDrafts"), channel, title: v.optional(v.string()), body: v.string() },
  handler: async (ctx, args) => {
    const row = await editable(ctx, args.draftId);
    await ctx.db.patch(row._id, { channel: args.channel, ...checkBody(args), ...(args.channel === "sms" ? { title: undefined } : {}), editedBy: ctx.identity.subject, updatedAt: Date.now() });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "dealmaker.draft_edited", subject: row._id });
    return null;
  },
});

export const discardDraft = workspaceMutation({
  args: { draftId: v.id("dealmakerDrafts") },
  handler: async (ctx, args) => {
    const row = await editable(ctx, args.draftId);
    await ctx.db.patch(row._id, { status: "discarded", updatedAt: Date.now() });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "dealmaker.draft_discarded", subject: row._id });
    return null;
  },
});

/** Whether anything has ever been sent to this lead through Vistrial. */
async function everMessaged(ctx: Pick<QueryCtx, "db">, scope: Scope, contactRef: string) {
  const connection = await crmConnectionFor(ctx, scope);
  if (!connection) return false;
  const done = await ctx.db
    .query("crmActions")
    .withIndex("by_connection_state", (q) => q.eq("connectionId", connection._id).eq("state", "done"))
    .take(1000);
  return done.some((row) => (row.kind === "send_sms" || row.kind === "send_email") && row.contactId === contactRef);
}

/** The lead's CRM tags, as last read. */
async function tagsOf(ctx: Pick<QueryCtx, "db">, scope: Scope, contactRef: string) {
  const connection = await crmConnectionFor(ctx, scope);
  if (!connection) return [];
  const row = await ctx.db
    .query("crmContacts")
    .withIndex("by_connection", (q) => q.eq("connectionId", connection._id).eq("externalId", contactRef))
    .first();
  return row?.tags ?? [];
}

/**
 * Sends a draft for approval. Dealmaker's checks first, then the approvals path. A low-stakes kind the Owner
 * made automatic is approved by that switch, their standing SEND; everything else waits for a person.
 */
export const submitDraft = workspaceMutation({
  args: { draftId: v.id("dealmakerDrafts") },
  handler: async (ctx, args) => {
    const row = await editable(ctx, args.draftId);
    const scope: Scope = { workspaceId: row.workspaceId, ...(row.clientId ? { clientId: row.clientId } : {}) };
    const settings = await settingsOf(ctx, scope);
    const consentTags = settings?.consentTags ?? [];
    const now = Date.now();
    if (consentTags.length) {
      const tags = new Set((await tagsOf(ctx, scope, row.contactRef)).map((tag) => tag.toLowerCase()));
      if (!consentTags.some((tag) => tags.has(tag.toLowerCase()))) {
        await ctx.db.patch(row._id, { status: "held", reason: COMMS_TEXT.noConsent, updatedAt: now });
        return { outcome: "held" as const, reason: COMMS_TEXT.noConsent };
      }
    }
    const decision = decideSend({
      // Only Dealmaker's own untouched drafts may count as a low-stakes kind; anything else is a person's message.
      kind: row.createdBy === "agent" && row.editedBy === undefined ? (row.kind as MessageKind) : "followUp",
      autonomous: settings?.autonomous ?? [],
      hasPrice: hasPrice(`${row.title ?? ""} ${row.body}`),
      firstToLead: !(await everMessaged(ctx, scope, row.contactRef)),
      paused: await isPaused(ctx, scope, row.contactRef),
    });
    if (decision.action === "hold") {
      await ctx.db.patch(row._id, { status: "held", reason: decision.reason, updatedAt: now });
      return { outcome: "held" as const, reason: decision.reason };
    }
    const outcome = await proposeCrmAction(ctx, { ...scope, agentSlug: SALES_CONVERSION }, {
      kind: row.channel === "sms" ? "send_sms" : "send_email",
      contactId: row.contactRef,
      ...(row.dealRef ? { dealId: row.dealRef } : {}),
      ...(row.title ? { title: row.title } : {}),
      body: row.body,
      why: row.why,
    });
    if (!outcome.ok) {
      await ctx.db.patch(row._id, { status: "draft", reason: `${outcome.reason} ${outcome.doItYourself}`.trim(), updatedAt: now });
      return { outcome: "notProposed" as const, reason: outcome.reason, doItYourself: outcome.doItYourself };
    }
    await ctx.db.patch(row._id, { status: "proposed", actionId: outcome.actionId as Id<"crmActions">, reason: decision.reason, updatedAt: now });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "dealmaker.draft_proposed", subject: row._id });
    // The Owner's switch for this low-stakes kind is their standing SEND, and only for a draft Dealmaker
    // wrote itself and nobody changed: a person's own words always wait for the typed SEND.
    const dealmakersOwn = row.createdBy === "agent" && row.editedBy === undefined;
    if (decision.action === "send" && dealmakersOwn) {
      const approved = await approveByStandingSwitch(ctx, outcome.actionId as Id<"crmActions">, row.kind);
      if (approved.state === "approved") return { outcome: "sending" as const, reason: decision.reason };
    }
    return { outcome: "proposed" as const, reason: decision.reason };
  },
});

/**
 * For Dealmaker's own drafting (13b): files a draft as the agent. Internal only, never reachable from a
 * client; the kind comes from the trigger that started it and must be a known kind.
 */
export async function fileAgentDraft(ctx: MutationCtx, input: Omit<Doc<"dealmakerDrafts">, "_id" | "_creationTime" | "status" | "createdBy" | "editedBy" | "createdAt" | "updatedAt">) {
  if (!(MESSAGE_KINDS as readonly string[]).includes(input.kind)) throw new Error(`Unknown message kind ${input.kind}`);
  const now = Date.now();
  return ctx.db.insert("dealmakerDrafts", { ...input, status: "draft", createdBy: "agent", createdAt: now, updatedAt: now });
}
