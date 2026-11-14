/**
 * Dealmaker's Pipeline board (build step 9): the CRM read through the shared layer and worked out in code
 * (lib/dealmaker/board.ts) on every read, filtered to the deals the person's home shows. Readiness facts and
 * commitments are written here by people; call reviews add theirs later. Nothing here contacts anyone or
 * changes the CRM: moving a deal is proposed through the approvals path.
 */

import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { clientForNew, clientHere, type ClientScope } from "./lib/clients";
import { crmFor } from "./lib/crm/read";
import { notFound, userError } from "./lib/errors";
import { BALL_LABEL, DAY, FIT_FIELDS, FIT_LABEL, HEALTH_LABEL, TEMPERATURE_BASIS, TEMPERATURE_LABEL, buildBoard, type Commitment, type Fact } from "./lib/dealmaker/board";
import { crmUserNames, dealScope, inScope, type TeamRow } from "./lib/dealmaker/roles";
import { DEFAULT_QUIET_DAYS } from "./lib/interview";
import { settingsOf } from "./playbookInterview";

type Ctx = QueryCtx & { workspaceId: Id<"workspaces">; clients: ClientScope };
type Scope = { workspaceId: Id<"workspaces">; clientId?: Id<"clients"> };

const LIMITS = { value: 300, text: 300, author: 80 } as const;
const fitField = v.union(...FIT_FIELDS.map((row) => v.literal(row)));
/** A person may record what the buyer said, a rep's account, or a recorded event. A measured result is code's. */
const personKind = v.union(v.literal("recorded"), v.literal("buyer"), v.literal("rep"));

async function readScope(ctx: Ctx, clientId: Id<"clients"> | undefined): Promise<Scope> {
  if (!clientId) {
    ctx.clients.require(undefined);
    return { workspaceId: ctx.workspaceId };
  }
  const client = await clientHere(ctx, ctx.workspaceId, clientId);
  ctx.clients.require(client._id);
  return { workspaceId: ctx.workspaceId, clientId: client._id };
}

/** The board for the organization or a client, as the caller's home shows it. */
export const board = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const scope = await readScope(ctx, args.clientId);
    const crm = await crmFor(ctx, scope);
    if (!crm) return { connected: false as const };
    const now = Date.now();
    const settings = await settingsOf(ctx, scope);
    const [pipelines, deals, activities, appointments, waiting, paused, facts, commitments] = await Promise.all([
      crm.pipelines(),
      crm.deals(),
      crm.activities({ since: now - 90 * DAY }),
      crm.appointments({ from: now - 30 * DAY, to: now + 30 * DAY }),
      ctx.db
        .query("crmActions")
        .withIndex("by_connection_state", (q) => q.eq("connectionId", crm.connection.id as Id<"crmConnections">).eq("state", "proposed"))
        .take(500),
      ctx.db
        .query("dealmakerPauses")
        .withIndex("by_workspace_contact", (q) => q.eq("workspaceId", ctx.workspaceId))
        .take(1000),
      ctx.db
        .query("dealFacts")
        .withIndex("by_workspace_deal", (q) => q.eq("workspaceId", ctx.workspaceId))
        .take(5000),
      ctx.db
        .query("dealCommitments")
        .withIndex("by_workspace_deal", (q) => q.eq("workspaceId", ctx.workspaceId))
        .take(5000),
    ]);
    const row = (settings?.team ?? []).find((item) => item.memberId === ctx.member._id) as TeamRow | undefined;
    const home = dealScope(ctx.member.role, row);
    const visible = inScope(home, deals);
    const mine = (r: { clientId?: Id<"clients"> }) => r.clientId === scope.clientId;
    const result = buildBoard({
      now,
      quietDays: settings?.quietDays ?? DEFAULT_QUIET_DAYS,
      currency: crm.connection.currency,
      pipeline: pipelines[0] ?? null,
      deals: visible,
      activities,
      appointments,
      waitingContacts: new Set(waiting.flatMap((r) => (r.contactId ? [r.contactId] : []))),
      pausedContacts: new Set(paused.filter((r) => mine(r) && r.liftedAt === undefined).map((r) => r.contactRef)),
      facts: facts.filter(mine).map((r): Fact => ({ dealRef: r.dealRef, field: r.field, value: r.value, kind: r.kind, author: r.author ?? null, at: r.recordedAt })),
      commitments: commitments.filter(mine).map((r): Commitment => ({ id: r._id, dealRef: r.dealRef, text: r.text, owner: r.owner, due: r.due ?? null, done: r.doneAt !== undefined })),
    });
    const seesAll = ctx.role === "owner" || ctx.role === "admin";
    const members = seesAll
      ? await ctx.db
          .query("members")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
          .take(500)
      : [];
    const names = crmUserNames(
      result.perRep.map((row) => row.ownerRef).filter((ref) => ref !== "unassigned"),
      settings?.team ?? [],
      (memberId) => members.find((member) => member._id === memberId)?.displayName ?? null,
    );
    return {
      connected: true as const,
      crm: { label: crm.connection.label, accountName: crm.connection.accountName, currency: crm.connection.currency, lastReadAt: crm.connection.lastReadAt },
      scope: home.kind,
      scopeWhy: home.why,
      quietDays: settings?.quietDays ?? DEFAULT_QUIET_DAYS,
      words: { health: HEALTH_LABEL, temperature: TEMPERATURE_LABEL, temperatureBasis: TEMPERATURE_BASIS, ball: BALL_LABEL, fit: FIT_LABEL },
      ...result,
      // Every rep's figures are for the people who coach them (doctrine V).
      perRep: seesAll ? result.perRep.map((row) => ({ ...row, name: row.ownerRef === "unassigned" ? "Not assigned" : (names.get(row.ownerRef) ?? "A CRM user") })) : null,
      canEdit: ctx.role !== "viewer",
    };
  },
});

/** A person records what is established about one fit field, with the kind of evidence it rests on. */
export const recordFact = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")), dealRef: v.string(), field: fitField, value: v.string(), kind: personKind, author: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const forClient = await clientForNew(ctx, args.clientId);
    const value = args.value.replace(/\s+/g, " ").trim().slice(0, LIMITS.value);
    if (!value) throw userError("Write what is established.");
    const author = args.kind === "rep" ? (args.author?.trim().slice(0, LIMITS.author) || ctx.member.displayName) : undefined;
    const id = await ctx.db.insert("dealFacts", {
      workspaceId: ctx.workspaceId,
      ...forClient,
      dealRef: args.dealRef.slice(0, 100),
      field: args.field,
      value,
      kind: args.kind,
      ...(author ? { author } : {}),
      recordedBy: ctx.identity.subject,
      recordedAt: Date.now(),
    });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "dealmaker.fact_recorded", subject: id });
    return id;
  },
});

/** A commitment on a deal: what done means, who owns it, and when it is due if it has a date. */
export const addCommitment = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")), dealRef: v.string(), text: v.string(), owner: v.string(), due: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const forClient = await clientForNew(ctx, args.clientId);
    const text = args.text.replace(/\s+/g, " ").trim().slice(0, LIMITS.text);
    if (!text) throw userError("Say what was promised.");
    if (args.owner !== "lead") {
      const member = ctx.db.normalizeId("members", args.owner) ? await ctx.db.get(args.owner as Id<"members">) : null;
      if (!member || member.workspaceId !== ctx.workspaceId) throw userError("Choose who owns it.");
    }
    const id = await ctx.db.insert("dealCommitments", { workspaceId: ctx.workspaceId, ...forClient, dealRef: args.dealRef.slice(0, 100), text, owner: args.owner, ...(args.due ? { due: args.due } : {}), createdBy: ctx.identity.subject, createdAt: Date.now() });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "dealmaker.commitment_added", subject: id });
    return id;
  },
});

export const completeCommitment = workspaceMutation({
  args: { commitmentId: v.id("dealCommitments") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.commitmentId);
    if (!row || row.workspaceId !== ctx.workspaceId || row.doneAt !== undefined) notFound();
    ctx.clients.require(row.clientId);
    await ctx.db.patch(row._id, { doneAt: Date.now(), doneBy: ctx.identity.subject });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "dealmaker.commitment_done", subject: row._id });
    return null;
  },
});
