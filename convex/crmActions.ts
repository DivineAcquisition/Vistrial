/**
 * Acting in a connected HighLevel sub-account, with approval. An agent or a person proposes one change;
 * nothing is sent to HighLevel until an Owner or Admin approves that change (an Owner with a typed word when
 * it changes a deal's outcome); it is carried out once; and every action keeps who proposed it, who decided,
 * and what HighLevel answered. An Owner can switch acting off for a connection, or for the whole organization,
 * which closes everything open. Messaging a lead has its own switch, off by default, and is checked against a
 * fresh read of the lead (opt-out, local time) at the moment it is sent. A failed action is reported in the
 * Briefing and never retried.
 * docs/rebuild/crm-highlevel.md, section 2A. The rules themselves are in lib/crmActions.ts.
 */

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { hlRequest, hlWrite, liveToken, type Counter } from "./highLevel";
import { NOT_WAITING_WORDS, recordDecision } from "./lib/approvals";
import { writeAudit } from "./lib/audit";
import { askApproval, post } from "./lib/briefing";
import { ownerMutation, workspaceMutation, workspaceQuery, type MemberAccess } from "./lib/builders";
import {
  checkInput,
  isMessage,
  MESSAGE_GAP_HOURS,
  messagingCheck,
  mayTriggerAutomation,
  reachabilityOf,
  PROPOSAL_HOURS,
  RESTRICTED,
  restrictionOf,
  reverseOf,
  summaryOf,
  writeRequest,
  type ActionInput,
} from "./lib/crmActions";
import { notFound, userError } from "./lib/errors";
import { isAdmin, isOwner } from "./lib/roles";

export const ACTING_OFF_WORDS = "An Owner has not let Vistrial act in this HighLevel sub-account. Turn on acting on the HighLevel page first.";
export const ORG_OFF_WORDS = "An Owner has stopped every CRM action for this organization.";
export const MESSAGING_OFF_WORDS = "Messaging leads is off for this HighLevel sub-account. Only an Owner can turn it on.";

/** Why nothing may be done through this connection right now, or null when it may. */
async function gate(ctx: Pick<QueryCtx, "db">, connection: Doc<"crmConnections">, kind: Doc<"crmActions">["kind"]): Promise<string | null> {
  const settings = await ctx.db
    .query("workspaceSettings")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", connection.workspaceId))
    .unique();
  if (settings?.crmActingOff) return ORG_OFF_WORDS;
  if (!connection.actingEnabled) return ACTING_OFF_WORDS;
  if (isMessage(kind) && !connection.messagingEnabled) return MESSAGING_OFF_WORDS;
  if (connection.status !== "connected") return "HighLevel no longer accepts this connection. Reconnect it first.";
  return null;
}

/** What a failure code means, for the Briefing. Never HighLevel's own words. */
export const FAILURE_WORDS: Record<string, string> = {
  opted_out: "The lead is on Do Not Disturb or opted out in HighLevel.",
  quiet_hours: "It was outside 8 am to 8 pm in the lead's local time.",
  no_timezone: "The lead's local time is not known, so quiet hours could not be checked.",
  no_address: "The lead has no phone number or email address for that message.",
  unreadable: "HighLevel did not return the lead.",
  too_soon: "Vistrial already messaged this lead in the last day.",
  paused: "This lead is paused after they asked us to stop, so nothing was sent.",
  token_rejected: "HighLevel no longer accepts the connection.",
  permission_missing: "HighLevel refused: the app lacks permission for this.",
  rate_limited: "HighLevel asked Vistrial to slow down.",
  bad_request: "HighLevel did not accept the change.",
  not_found: "HighLevel could not find the deal or lead.",
  connection_failed: "HighLevel could not be reached.",
  provider_down: "HighLevel is having trouble.",
};

const inputArgs = {
  kind: v.union(
    v.literal("move_stage"),
    v.literal("set_status"),
    v.literal("add_tag"),
    v.literal("remove_tag"),
    v.literal("add_note"),
    v.literal("create_task"),
    v.literal("send_sms"),
    v.literal("send_email"),
  ),
  dealId: v.optional(v.string()),
  contactId: v.optional(v.string()),
  stageId: v.optional(v.string()),
  status: v.optional(v.string()),
  tag: v.optional(v.string()),
  title: v.optional(v.string()),
  body: v.optional(v.string()),
  dueAt: v.optional(v.number()),
  why: v.string(),
};

type Ctx = MutationCtx;

/** How an action reads in the organization's one approvals queue. */
export function actionApproval(action: Pick<Doc<"crmActions">, "_id" | "workspaceId" | "clientId" | "summary" | "restricted" | "agentSlug">) {
  return {
    workspaceId: action.workspaceId,
    ...(action.clientId ? { clientId: action.clientId } : {}),
    kind: "accountChange" as const,
    subjectTable: "crmActions",
    subjectId: action._id as string,
    summary: action.summary,
    ...(action.restricted ? { ownerOnly: true } : {}),
    ...(action.agentSlug ? { agentSlug: action.agentSlug } : {}),
  };
}

/** The word an Owner types to approve a restricted action, if this one is. */
export function confirmOf(action: Pick<Doc<"crmActions">, "restricted">) {
  return action.restricted ? { word: RESTRICTED[action.restricted].word, why: RESTRICTED[action.restricted].why } : null;
}

async function connectionOf(ctx: Pick<QueryCtx, "db">, workspaceId: Id<"workspaces">, clientId: Id<"clients"> | undefined) {
  return ctx.db
    .query("crmConnections")
    .withIndex("by_workspace_client", (q) => q.eq("workspaceId", workspaceId).eq("clientId", clientId))
    .unique();
}

const findDeal = (ctx: Pick<QueryCtx, "db">, connectionId: Id<"crmConnections">, externalId: string) =>
  ctx.db.query("crmDeals").withIndex("by_connection", (q) => q.eq("connectionId", connectionId).eq("externalId", externalId)).unique();
const findContact = (ctx: Pick<QueryCtx, "db">, connectionId: Id<"crmConnections">, externalId: string) =>
  ctx.db.query("crmContacts").withIndex("by_connection", (q) => q.eq("connectionId", connectionId).eq("externalId", externalId)).unique();
const findPipeline = (ctx: Pick<QueryCtx, "db">, connectionId: Id<"crmConnections">, externalId: string) =>
  ctx.db.query("crmPipelines").withIndex("by_connection", (q) => q.eq("connectionId", connectionId).eq("externalId", externalId)).unique();

/**
 * Writes a proposal down and asks for a decision. Refused unless acting is on, the connection is live, and
 * the deal or lead is one Vistrial read from this sub-account: an id cannot be invented.
 */
async function proposeAction(
  ctx: Ctx,
  connection: Doc<"crmConnections">,
  input: ActionInput,
  why: string,
  proposedBy: string,
  extra: { agentSlug?: string; undoOf?: Id<"crmActions"> } = {},
): Promise<Id<"crmActions">> {
  const blocked = await gate(ctx, connection, input.kind);
  if (blocked) throw userError(blocked, "not_allowed");
  const now = Date.now();
  const checked = checkInput(input, now);
  if (!checked.ok) throw userError(checked.reason);
  const value = checked.value;
  const reason = why.replace(/\s+/g, " ").trim().slice(0, 300);
  if (!reason) throw userError("Say in a sentence why.");

  let before: Doc<"crmActions">["before"];
  let pipelineId: string | undefined;
  const words: { fromStage?: string; toStage?: string; fromStatus?: string } = {};
  if (value.kind === "move_stage" || value.kind === "set_status") {
    const deal = await findDeal(ctx, connection._id, value.dealId!);
    if (!deal) throw userError("Vistrial has not read that deal from this sub-account. Read again, then try.");
    if (value.kind === "move_stage") {
      const pipeline = await findPipeline(ctx, connection._id, deal.pipelineId);
      const to = pipeline?.stages.find((stage) => stage.id === value.stageId);
      if (!pipeline || !to) throw userError("That stage is not in this deal's pipeline.");
      if (deal.stageId === value.stageId) throw userError("The deal is already in that stage.");
      pipelineId = deal.pipelineId;
      before = { pipelineId: deal.pipelineId, stageId: deal.stageId };
      words.fromStage = pipeline.stages.find((stage) => stage.id === deal.stageId)?.name;
      words.toStage = to.name;
    } else {
      if (deal.status === value.status) throw userError(`The deal is already ${value.status}.`);
      before = { status: deal.status };
      words.fromStatus = deal.status;
    }
  } else {
    const contact = await findContact(ctx, connection._id, value.contactId!);
    if (!contact) throw userError("Vistrial has not read that lead from this sub-account. Read again, then try.");
    const has = contact.tags.some((tag) => tag.toLowerCase() === value.tag?.toLowerCase());
    if (value.kind === "add_tag" && has) throw userError("The lead already has that tag.");
    if (value.kind === "send_sms" && !contact.phone) throw userError("Vistrial has no phone number for that lead.");
    if (value.kind === "send_email" && !contact.email) throw userError("Vistrial has no email address for that lead.");
  }

  // The same change already waiting is not asked for twice.
  const open = await ctx.db
    .query("crmActions")
    .withIndex("by_connection_state", (q) => q.eq("connectionId", connection._id).eq("state", "proposed"))
    .take(200);
  const same = open.find(
    (row) =>
      row.kind === value.kind &&
      row.dealId === value.dealId &&
      row.contactId === value.contactId &&
      row.stageId === value.stageId &&
      row.status === value.status &&
      row.tag === value.tag &&
      row.title === value.title &&
      row.body === value.body,
  );
  if (same) return same._id;

  const restricted = restrictionOf(value.kind) ?? undefined;
  const summary = summaryOf(value, words);
  const actionId = await ctx.db.insert("crmActions", {
    workspaceId: connection.workspaceId,
    clientId: connection.clientId,
    connectionId: connection._id,
    kind: value.kind,
    dealId: value.dealId,
    contactId: value.contactId,
    pipelineId,
    stageId: value.stageId,
    status: value.status,
    tag: value.tag,
    title: value.title,
    body: value.body,
    dueAt: value.dueAt,
    before,
    restricted,
    summary,
    why: reason,
    proposedBy,
    agentSlug: extra.agentSlug,
    state: "proposed",
    proposedAt: now,
    undoOf: extra.undoOf,
  });
  const row = (await ctx.db.get(actionId))!;
  const warning = isMessage(value.kind)
    ? " This messages the lead. Vistrial checks their opt-out and local time again just before sending."
    : mayTriggerAutomation(value.kind)
      ? " This may start a workflow set up in HighLevel, which can message the lead."
      : "";
  await askApproval(ctx, { ...actionApproval(row), requestedBy: proposedBy === "agent" ? "agent" : proposedBy }, { title: summary, body: `${reason}${warning}` });
  await writeAudit(ctx, {
    workspaceId: connection.workspaceId,
    actorType: proposedBy === "agent" ? "system" : "user",
    actorId: proposedBy === "agent" ? (extra.agentSlug ?? "agent") : proposedBy,
    action: `crm.action.proposed.${value.kind}`,
    subject: actionId,
  });
  return actionId;
}

/** Proposes a change in the connected HighLevel sub-account. Owners, Admins and Members; nothing happens until it is approved. */
export const propose = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")), ...inputArgs },
  handler: async (ctx, args) => {
    const { clientId, why, ...input } = args;
    // Through the guarded database: a member who may not see this client cannot find its connection.
    const connection = await connectionOf(ctx, ctx.workspaceId, clientId);
    if (!connection) notFound();
    return proposeAction(ctx, connection, input, why, ctx.identity.subject);
  },
});

/**
 * An agent proposes one change; a person decides. Skills reach this through `lib/crm/act.ts`, which checks
 * first that the connected CRM can do the action at all.
 */
export async function proposeAgentAction(ctx: Ctx, args: { workspaceId: Id<"workspaces">; clientId?: Id<"clients">; agentSlug: string; why: string } & ActionInput) {
  const { workspaceId, clientId, agentSlug, why, ...input } = args;
  const connection = await connectionOf(ctx, workspaceId, clientId);
  if (!connection) throw userError("HighLevel is not connected here.");
  return proposeAction(ctx, connection, input, why, "agent", { agentSlug });
}

/** The door an agent uses from an action. The agent proposes; a person decides. */
export const proposeForAgent = internalMutation({
  args: { workspaceId: v.id("workspaces"), clientId: v.optional(v.id("clients")), agentSlug: v.string(), ...inputArgs },
  handler: async (ctx, args) => proposeAgentAction(ctx, args),
});

type Decider = Ctx & MemberAccess;

async function settle(ctx: Ctx, action: Doc<"crmActions">, state: "declined" | "expired" | "cancelled", actor: string) {
  await ctx.db.patch(action._id, { state, decidedBy: actor, decidedAt: Date.now() });
  await recordDecision(ctx, { ...actionApproval(action), status: state === "expired" ? "expired" : "declined", actor });
}

/**
 * Decides one proposed action. Owners and Admins; a restricted one is the Owner's alone, with the typed word.
 * Approving schedules it to be carried out once; the acting switch and the connection are checked again then.
 */
export async function decideAction(ctx: Decider, args: { actionId: Id<"crmActions">; approve: boolean; confirmWord?: string }) {
  if (!isAdmin(ctx.member.role)) notFound();
  const action = await ctx.db.get(args.actionId);
  if (!action || action.workspaceId !== ctx.workspaceId) notFound();
  if (action.state !== "proposed") throw userError(NOT_WAITING_WORDS);
  if (Date.now() - action.proposedAt > PROPOSAL_HOURS * 3_600_000) {
    // Returned, not thrown: a thrown error would undo the expiry with the rest of this write.
    await settle(ctx, action, "expired", "system");
    return { state: "expired" as const };
  }
  if (!args.approve) {
    await settle(ctx, action, "declined", ctx.identity.subject);
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "crm.action.declined", subject: action._id });
    return { state: "declined" as const };
  }
  const confirm = confirmOf(action);
  if (confirm) {
    if (!isOwner(ctx.member.role)) throw userError("Only an Owner can approve this one.", "not_allowed");
    if ((args.confirmWord ?? "").trim() !== confirm.word) throw userError(`Type ${confirm.word} to approve this.`);
  }
  const connection = await ctx.db.get(action.connectionId);
  if (!connection || (await gate(ctx, connection, action.kind))) {
    await settle(ctx, action, "cancelled", "system");
    return { state: "cancelled" as const };
  }
  await ctx.db.patch(action._id, { state: "approved", decidedBy: ctx.identity.subject, decidedAt: Date.now() });
  await recordDecision(ctx, { ...actionApproval(action), status: "approved", actor: ctx.identity.subject });
  await writeAudit(ctx, {
    workspaceId: ctx.workspaceId,
    actorType: "user",
    actorId: ctx.identity.subject,
    action: confirm ? "crm.action.approvedRestricted" : "crm.action.approved",
    subject: action._id,
  });
  await ctx.scheduler.runAfter(0, internal.crmActions.execute, { actionId: action._id });
  return { state: "approved" as const };
}

/** Approve or decline from the HighLevel page. The approvals queue uses the same rule. */
export const decide = workspaceMutation({
  args: { actionId: v.id("crmActions"), approve: v.boolean(), confirmWord: v.optional(v.string()) },
  handler: async (ctx, args) => decideAction(ctx, args),
});

/** Proposes the reverse of a done action. It is approved like any other. */
export const undo = workspaceMutation({
  args: { actionId: v.id("crmActions"), why: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const action = await ctx.db.get(args.actionId);
    if (!action || action.workspaceId !== ctx.workspaceId) notFound();
    if (action.state !== "done" || action.undoneBy) throw userError("Only a done action that was not undone yet can be undone.");
    const reverse = reverseOf(action, action.before);
    if (!reverse) throw userError("Vistrial cannot undo this. It can be changed in HighLevel.");
    const connection = await ctx.db.get(action.connectionId);
    if (!connection) notFound();
    return proposeAction(ctx, connection, reverse, args.why?.trim() || `Undo: ${action.summary.replace(/^HighLevel: /, "")}`, ctx.identity.subject, { undoOf: action._id });
  },
});

/**
 * Closes every open action of a connection: waiting ones are declined in the approvals queue, approved ones
 * not yet carried out are cancelled. Used when acting is switched off and when a connection is removed.
 */
export async function closeOpenActions(ctx: Ctx, connectionId: Id<"crmConnections">, actor: string, state: "cancelled", only?: (row: Doc<"crmActions">) => boolean) {
  for (const open of ["proposed", "approved"] as const) {
    const rows = await ctx.db
      .query("crmActions")
      .withIndex("by_connection_state", (q) => q.eq("connectionId", connectionId).eq("state", open))
      .take(500);
    for (const row of rows) {
      if (only && !only(row)) continue;
      if (open === "proposed") await settle(ctx, row, state, actor);
      else await ctx.db.patch(row._id, { state, resultCode: "acting_off" });
    }
  }
}

/** Turns acting in this sub-account on or off. Owner only. Off closes everything open at once. */
export const setActing = ownerMutation({
  args: { clientId: v.optional(v.id("clients")), on: v.boolean() },
  handler: async (ctx, args) => {
    const connection = await connectionOf(ctx, ctx.workspaceId, args.clientId);
    if (!connection) notFound();
    await ctx.db.patch(connection._id, { actingEnabled: args.on, actingChangedBy: ctx.identity.subject, actingChangedAt: Date.now() });
    if (!args.on) await closeOpenActions(ctx, connection._id, ctx.identity.subject, "cancelled");
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: args.on ? "crm.acting.on" : "crm.acting.off", subject: `highlevel:${connection.accountId}` });
    return null;
  },
});

/**
 * Turns messaging leads on or off for this sub-account. Owner only, and off by default. Turning it on needs
 * acting on, and the Owner's confirmation that the business has its leads' consent to be texted and emailed
 * (TCPA, CAN-SPAM): Vistrial cannot see consent, so the business is responsible for it. Off closes every open
 * message at once.
 */
export const setMessaging = ownerMutation({
  args: { clientId: v.optional(v.id("clients")), on: v.boolean(), consentConfirmed: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const connection = await connectionOf(ctx, ctx.workspaceId, args.clientId);
    if (!connection) notFound();
    if (args.on) {
      if (!connection.actingEnabled) throw userError("Turn on acting in this sub-account first.");
      if (args.consentConfirmed !== true) throw userError("Confirm that your business has its leads' consent to be texted and emailed.");
      await ctx.db.patch(connection._id, { messagingEnabled: true, consentAttestedBy: ctx.identity.subject, consentAttestedAt: Date.now() });
    } else {
      await ctx.db.patch(connection._id, { messagingEnabled: false });
      await closeOpenActions(ctx, connection._id, ctx.identity.subject, "cancelled", (row) => isMessage(row.kind));
    }
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: args.on ? "crm.messaging.on" : "crm.messaging.off", subject: `highlevel:${connection.accountId}` });
    return null;
  },
});

/** Stops (or allows again) every CRM action across the organization, whatever each connection allows. Owner only. */
export const setOrganizationActing = ownerMutation({
  args: { on: v.boolean() },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .unique();
    if (settings) await ctx.db.patch(settings._id, { crmActingOff: !args.on });
    else await ctx.db.insert("workspaceSettings", { workspaceId: ctx.workspaceId, setupDone: false, themeDefault: "light", crmActingOff: !args.on });
    if (!args.on) {
      // The raw database: an Owner sees every client, and every connection must close.
      const connections = await ctx.db
        .query("crmConnections")
        .withIndex("by_workspace_client", (q) => q.eq("workspaceId", ctx.workspaceId))
        .take(500);
      for (const connection of connections) await closeOpenActions(ctx, connection._id, ctx.identity.subject, "cancelled");
    }
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: args.on ? "crm.organization.on" : "crm.organization.off", subject: ctx.workspaceId });
    return null;
  },
});

/** Proposals nobody decided within a day expire. Run with each scheduled read. */
export const expireStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const connections = await ctx.db.query("crmConnections").take(1000);
    let expired = 0;
    for (const connection of connections) {
      const rows = await ctx.db
        .query("crmActions")
        .withIndex("by_connection_state", (q) => q.eq("connectionId", connection._id).eq("state", "proposed"))
        .take(200);
      for (const row of rows) {
        if (Date.now() - row.proposedAt > PROPOSAL_HOURS * 3_600_000) {
          await settle(ctx, row, "expired", "system");
          expired++;
        }
      }
    }
    return { expired };
  },
});

// ---------- Carrying out an approved action, once ----------

/** Takes an approved action to running. Null (and cancelled) when acting was switched off or the connection went meanwhile. */
export const claim = internalMutation({
  args: { actionId: v.id("crmActions") },
  handler: async (ctx, args) => {
    const action = await ctx.db.get(args.actionId);
    if (!action || action.state !== "approved") return null;
    const connection = await ctx.db.get(action.connectionId);
    if (!connection || (await gate(ctx, connection, action.kind))) {
      await ctx.db.patch(action._id, { state: "cancelled", resultCode: "acting_off" });
      return null;
    }
    if (isMessage(action.kind) && action.contactId) {
      // A lead paused after a negative reply gets nothing until a person lifts the pause (Dealmaker, 0.2).
      const pauses = await ctx.db
        .query("dealmakerPauses")
        .withIndex("by_workspace_contact", (q) => q.eq("workspaceId", action.workspaceId).eq("contactRef", action.contactId!))
        .take(20);
      if (pauses.some((row) => row.liftedAt === undefined)) {
        await ctx.db.patch(action._id, { state: "running" });
        await failAndReport(ctx, { ...action, state: "running" }, "paused");
        return null;
      }
      // At most one message from Vistrial to a lead a day, whoever approved it.
      const done = await ctx.db
        .query("crmActions")
        .withIndex("by_connection_state", (q) => q.eq("connectionId", connection._id).eq("state", "done"))
        .take(500);
      const recent = done.some((row) => isMessage(row.kind) && row.contactId === action.contactId && (row.doneAt ?? 0) > Date.now() - MESSAGE_GAP_HOURS * 3_600_000);
      if (recent) {
        await ctx.db.patch(action._id, { state: "running" });
        await failAndReport(ctx, { ...action, state: "running" }, "too_soon");
        return null;
      }
    }
    await ctx.db.patch(action._id, { state: "running" });
    return { action, timezone: connection.timezone ?? null, consentAt: connection.consentAttestedAt ?? null };
  },
});

/** Marks a failed action and says so in the Briefing. A failure is reported once and never retried. */
async function failAndReport(ctx: Ctx, action: Doc<"crmActions">, code: string) {
  await ctx.db.patch(action._id, { state: "failed", doneAt: Date.now(), resultCode: code });
  await writeAudit(ctx, { workspaceId: action.workspaceId, actorType: "system", actorId: "crm", action: "crm.action.failed", subject: action._id });
  await post(ctx, {
    workspaceId: action.workspaceId,
    clientId: action.clientId,
    kind: "alert",
    title: "A HighLevel change was not made",
    body: `${action.summary.replace(/^HighLevel: /, "").replace(/^./, (c) => c.toUpperCase())}. ${FAILURE_WORDS[code] ?? "HighLevel returned an error."} It was not retried.`,
    ref: { table: "crmActions", id: action._id },
    key: `crm-failed:${action._id}`,
  });
}

/** Keeps what the checks found before a message was sent or refused. */
export const recordChecks = internalMutation({
  args: {
    actionId: v.id("crmActions"),
    checks: v.object({ at: v.number(), dnd: v.boolean(), timezone: v.optional(v.string()), localHour: v.optional(v.number()), consent: v.string(), result: v.string() }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.actionId, { checks: args.checks });
    return null;
  },
});

/** Records what HighLevel answered, and mirrors a done change in what Vistrial keeps, so screens agree. */
export const finish = internalMutation({
  args: { actionId: v.id("crmActions"), ok: v.boolean(), code: v.string(), externalId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const action = await ctx.db.get(args.actionId);
    if (!action) return null;
    if (!args.ok) {
      await failAndReport(ctx, action, args.code);
      return null;
    }
    await ctx.db.patch(action._id, { state: "done", doneAt: Date.now(), resultCode: args.code, externalId: args.externalId });
    await writeAudit(ctx, { workspaceId: action.workspaceId, actorType: "system", actorId: "crm", action: "crm.action.done", subject: action._id });
    if (action.undoOf) await ctx.db.patch(action.undoOf, { undoneBy: action._id });
    if (action.dealId && (action.kind === "move_stage" || action.kind === "set_status")) {
      const deal = await findDeal(ctx, action.connectionId, action.dealId);
      if (deal) {
        await ctx.db.patch(
          deal._id,
          action.kind === "move_stage"
            ? { stageId: action.stageId!, lastStageChangeAt: Date.now() }
            : { status: action.status as Doc<"crmDeals">["status"], lastStatusChangeAt: Date.now() },
        );
      }
    }
    if (action.contactId && (action.kind === "add_tag" || action.kind === "remove_tag")) {
      const contact = await findContact(ctx, action.connectionId, action.contactId);
      if (contact) {
        const rest = contact.tags.filter((tag) => tag.toLowerCase() !== action.tag!.toLowerCase());
        await ctx.db.patch(contact._id, { tags: action.kind === "add_tag" ? [...rest, action.tag!].slice(-10) : rest });
      }
    }
    return null;
  },
});

/** Carries out one approved action: one HighLevel request, counted, never retried. */
export const execute = internalAction({
  args: { actionId: v.id("crmActions") },
  handler: async (ctx, args): Promise<{ code: string }> => {
    const claimed: { action: Doc<"crmActions">; timezone: string | null; consentAt: number | null } | null = await ctx.runMutation(internal.crmActions.claim, args);
    if (!claimed) return { code: "cancelled" };
    const { action } = claimed;
    const live = await liveToken(ctx, action.connectionId);
    if (!live.ok) {
      await ctx.runMutation(internal.crmActions.finish, { actionId: action._id, ok: false, code: live.code });
      return { code: live.code };
    }
    const counter: Counter = { ok: 0, failed: 0, lastCode: null };
    if (isMessage(action.kind)) {
      // Read the lead fresh from HighLevel and check opt-out and local time at the moment of sending.
      const channel = action.kind === "send_sms" ? "SMS" : "Email";
      const fresh = await hlRequest(live.token, `/contacts/${action.contactId}`, counter);
      const reach = fresh.ok ? reachabilityOf(fresh.body, channel) : null;
      const now = Date.now();
      const check = messagingCheck({ reach, channel, locationTimezone: claimed.timezone, now });
      await ctx.runMutation(internal.crmActions.recordChecks, {
        actionId: action._id,
        checks: {
          at: now,
          dnd: Boolean(reach && (reach.dnd || reach.channelDnd)),
          timezone: check.ok ? check.timezone : (reach?.timezone ?? claimed.timezone ?? undefined),
          localHour: check.ok ? check.localHour : undefined,
          consent: claimed.consentAt ? `Owner confirmed consent on ${new Date(claimed.consentAt).toISOString().slice(0, 10)}` : "No consent confirmation on record",
          result: check.ok ? "passed" : check.code,
        },
      });
      if (!check.ok) {
        await ctx.runMutation(internal.crmActions.finish, { actionId: action._id, ok: false, code: check.code });
        await ctx.runMutation(internal.highLevel.recordCalls, { connectionId: action.connectionId, ok: counter.ok, failed: counter.failed, code: check.code });
        return { code: check.code };
      }
    }
    const request = writeRequest({
      kind: action.kind,
      dealId: action.dealId,
      contactId: action.contactId,
      pipelineId: action.pipelineId,
      stageId: action.stageId,
      status: action.status,
      tag: action.tag,
      title: action.title,
      body: action.body,
      dueAt: action.dueAt,
    });
    const result = await hlWrite(live.token, request, counter);
    const made = result.ok ? ((result.body as { note?: { id?: unknown }; task?: { id?: unknown } } | null) ?? null) : null;
    const externalId = typeof made?.note?.id === "string" ? made.note.id : typeof made?.task?.id === "string" ? made.task.id : undefined;
    await ctx.runMutation(internal.crmActions.finish, { actionId: action._id, ok: result.ok, code: result.code, externalId });
    await ctx.runMutation(internal.highLevel.recordCalls, { connectionId: action.connectionId, ok: counter.ok, failed: counter.failed, code: result.code });
    return { code: result.code };
  },
});

// ---------- What screens read ----------

/**
 * The acting switch, what is waiting and what was done, and what may be acted on (open deals and recent
 * leads), for one client's HighLevel. Anyone who may see the client reads it; the buttons follow the role.
 */
export const list = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const connection = await connectionOf(ctx, ctx.workspaceId, args.clientId);
    const role = ctx.member.role;
    const can = { toggle: isOwner(role), propose: role !== "viewer" && ctx.role !== "viewer", approve: isAdmin(role), approveRestricted: isOwner(role) };
    const settings = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .unique();
    const organizationOff = settings?.crmActingOff === true;
    if (!connection) return { connected: false, enabled: false, organizationOff, messaging: { enabled: false, consentAt: null }, can, actions: [], deals: [], leads: [], stages: [] };
    const rows = await ctx.db
      .query("crmActions")
      .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
      .order("desc")
      .take(30);
    const contacts = await ctx.db
      .query("crmContacts")
      .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
      .take(2500);
    const nameOf = new Map(contacts.map((row) => [row.externalId, row.name ?? row.email ?? "A lead"]));
    const deals = await ctx.db
      .query("crmDeals")
      .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
      .take(2500);
    const pipelines = await ctx.db
      .query("crmPipelines")
      .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
      .take(50);
    const stageName = new Map(pipelines.flatMap((pipeline) => pipeline.stages.map((stage) => [stage.id, stage.name] as const)));
    const dealLead = new Map(deals.map((deal) => [deal.externalId, deal.contactId ? nameOf.get(deal.contactId) : undefined]));
    return {
      connected: true,
      enabled: connection.actingEnabled === true,
      organizationOff,
      messaging: { enabled: connection.messagingEnabled === true, consentAt: connection.consentAttestedAt ?? null },
      can,
      actions: rows.map((row) => ({
        id: row._id,
        kind: row.kind,
        summary: row.summary,
        why: row.why,
        lead: (row.contactId ? nameOf.get(row.contactId) : row.dealId ? dealLead.get(row.dealId) : undefined) ?? null,
        body: row.body ?? null,
        state: row.state,
        restricted: confirmOf(row),
        mayTriggerAutomation: mayTriggerAutomation(row.kind),
        proposedBy: row.proposedBy === "agent" ? (row.agentSlug ?? "agent") : "person",
        proposedAt: row.proposedAt,
        decidedAt: row.decidedAt ?? null,
        doneAt: row.doneAt ?? null,
        resultCode: row.resultCode ?? null,
        checks: row.checks ?? null,
        canUndo: row.state === "done" && !row.undoneBy && reverseOf(row, row.before) !== null,
        undone: Boolean(row.undoneBy),
      })),
      deals: deals
        .filter((deal) => deal.status === "open")
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .slice(0, 100)
        .map((deal) => ({ id: deal.externalId, pipelineId: deal.pipelineId, stage: stageName.get(deal.stageId) ?? "Stage", stageId: deal.stageId, value: deal.value, lead: dealLead.get(deal.externalId) ?? "A lead" })),
      leads: contacts
        .sort((a, b) => (b.lastActivityAt ?? b.addedAt ?? 0) - (a.lastActivityAt ?? a.addedAt ?? 0))
        .slice(0, 100)
        .map((row) => ({ id: row.externalId, name: row.name ?? row.email ?? "A lead", tags: row.tags, phone: Boolean(row.phone), email: Boolean(row.email) })),
      stages: pipelines.map((pipeline) => ({ pipelineId: pipeline.externalId, name: pipeline.name, stages: pipeline.stages.map((stage) => ({ id: stage.id, name: stage.name })) })),
    };
  },
});
