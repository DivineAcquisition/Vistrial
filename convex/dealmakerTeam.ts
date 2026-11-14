/**
 * Dealmaker's team and autonomy (docs/rebuild/dealmaker.md, 0.1 and 0.2, build step 8): each member's sales
 * role and the CRM user they are, the message kinds the Owner made automatic, leads paused after a negative
 * reply, and each person's home filtered to the deals assigned to them. The rules are in lib/dealmaker.
 * Nothing here sends anything.
 */

import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { adminMutation, workspaceMutation, workspaceQuery } from "./lib/builders";
import { clientForNew, clientHere, type ClientScope } from "./lib/clients";
import { crmFor } from "./lib/crm/read";
import { notAllowed, notFound, userError } from "./lib/errors";
import { LOW_STAKES, MESSAGE_KINDS, MESSAGE_KIND_LABEL, STOP_WORDS, canBeAutonomous, type MessageKind } from "./lib/dealmaker/autonomy";
import { SALES_ROLES, SALES_ROLE_LABEL, crmUserNames, dealScope, inScope, type TeamRow } from "./lib/dealmaker/roles";
import { isOwner } from "./lib/roles";
import { settingsOf } from "./playbookInterview";

type Ctx = QueryCtx & { workspaceId: Id<"workspaces">; clients: ClientScope };
type Scope = { workspaceId: Id<"workspaces">; clientId?: Id<"clients"> };

const salesRole = v.union(...SALES_ROLES.map((row) => v.literal(row)));
const MAX_REASON = 200;

async function readScope(ctx: Ctx, clientId: Id<"clients"> | undefined): Promise<Scope> {
  if (!clientId) {
    ctx.clients.require(undefined);
    return { workspaceId: ctx.workspaceId };
  }
  const client = await clientHere(ctx, ctx.workspaceId, clientId);
  ctx.clients.require(client._id);
  return { workspaceId: ctx.workspaceId, clientId: client._id };
}

async function pausedOf(ctx: Pick<QueryCtx, "db">, scope: Scope) {
  const rows = await ctx.db
    .query("dealmakerPauses")
    .withIndex("by_workspace_contact", (q) => q.eq("workspaceId", scope.workspaceId))
    .take(1000);
  return rows.filter((row) => row.clientId === scope.clientId && row.liftedAt === undefined);
}

/** Whether Dealmaker must hold everything for this contact. Read by the drafting steps. */
export async function isPaused(ctx: Pick<QueryCtx, "db">, scope: Scope, contactRef: string) {
  return (await pausedOf(ctx, scope)).some((row) => row.contactRef === contactRef);
}

/** The team, the CRM users seen on deals, the automatic kinds and the paused leads. */
export const team = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const scope = await readScope(ctx, args.clientId);
    const [settings, crm, paused, members] = await Promise.all([
      settingsOf(ctx, scope),
      crmFor(ctx, scope),
      pausedOf(ctx, scope),
      ctx.db
        .query("members")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
        .take(500),
    ]);
    const deals = crm ? await crm.deals() : [];
    const counts = new Map<string, number>();
    for (const deal of deals) if (deal.ownerRef) counts.set(deal.ownerRef, (counts.get(deal.ownerRef) ?? 0) + 1);
    const rows = new Map((settings?.team ?? []).map((row) => [row.memberId as string, row]));
    const autonomous = new Set(settings?.autonomous ?? []);
    return {
      crmConnected: !!crm,
      members: members
        .filter((row) => row.active)
        .map((row) => ({ id: row._id, name: row.displayName || row.email || "A member", appRole: row.role, salesRole: rows.get(row._id)?.salesRole ?? null, crmUserRef: rows.get(row._id)?.crmUserRef ?? null })),
      crmUsers: (() => {
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        const names = crmUserNames(sorted.map(([ref]) => ref), settings?.team ?? [], (memberId) => members.find((member) => member._id === memberId)?.displayName ?? null);
        return sorted.map(([ref, deals]) => ({ ref, deals, label: names.get(ref)! }));
      })(),
      roles: SALES_ROLES.map((id) => ({ id, ...SALES_ROLE_LABEL[id] })),
      kinds: MESSAGE_KINDS.map((id) => ({ id, label: MESSAGE_KIND_LABEL[id], canBeAutomatic: canBeAutonomous(id), automatic: autonomous.has(id) })),
      paused: paused.map((row) => ({ id: row._id, contactRef: row.contactRef, reason: row.reason, pausedAt: row.pausedAt })),
      canSetTeam: ctx.role === "owner" || ctx.role === "admin",
      canSetAutonomy: isOwner(ctx.member.role),
    };
  },
});

/** Gives a member a sales role and links them to a CRM user, or removes the role. Owners and Admins. */
export const setRole = adminMutation({
  args: { clientId: v.optional(v.id("clients")), memberId: v.id("members"), salesRole: v.union(salesRole, v.null()), crmUserRef: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const scope = { workspaceId: ctx.workspaceId, ...(await clientForNew(ctx, args.clientId)) };
    const member = await ctx.db.get(args.memberId);
    if (!member || member.workspaceId !== ctx.workspaceId) notFound();
    const settings = await settingsOf(ctx, scope);
    const others = (settings?.team ?? []).filter((row) => row.memberId !== args.memberId);
    const crmUserRef = args.crmUserRef?.trim().slice(0, 100) || undefined;
    const team = args.salesRole ? [...others, { memberId: args.memberId, salesRole: args.salesRole, ...(crmUserRef ? { crmUserRef } : {}) }] : others;
    const stamp = { updatedBy: ctx.identity.subject, updatedAt: Date.now() };
    if (settings) await ctx.db.patch(settings._id, { team, ...stamp });
    else await ctx.db.insert("dealmakerSettings", { workspaceId: ctx.workspaceId, ...(scope.clientId ? { clientId: scope.clientId } : {}), team, ...stamp });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "dealmaker.role_set", subject: args.memberId });
    return null;
  },
});

/** The Owner makes a low-stakes kind automatic, or not. Every other kind is refused. */
export const setAutonomy = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")), kind: v.string(), automatic: v.boolean() },
  handler: async (ctx, args) => {
    if (!isOwner(ctx.member.role)) notAllowed();
    if (!(MESSAGE_KINDS as readonly string[]).includes(args.kind) || !canBeAutonomous(args.kind as MessageKind)) throw userError(STOP_WORDS.notLowStakes);
    const scope = { workspaceId: ctx.workspaceId, ...(await clientForNew(ctx, args.clientId)) };
    const settings = await settingsOf(ctx, scope);
    const now = new Set((settings?.autonomous ?? []).filter((row) => LOW_STAKES.includes(row as MessageKind)));
    if (args.automatic) now.add(args.kind);
    else now.delete(args.kind);
    const stamp = { updatedBy: ctx.identity.subject, updatedAt: Date.now() };
    if (settings) await ctx.db.patch(settings._id, { autonomous: [...now], ...stamp });
    else await ctx.db.insert("dealmakerSettings", { workspaceId: ctx.workspaceId, ...(scope.clientId ? { clientId: scope.clientId } : {}), autonomous: [...now], ...stamp });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: args.automatic ? "dealmaker.autonomy_on" : "dealmaker.autonomy_off", subject: args.kind });
    return null;
  },
});

/** A person pauses all contact with a lead (Dealmaker will also do this on a negative reply). */
export const pauseLead = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")), contactRef: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    const scope = { workspaceId: ctx.workspaceId, ...(await clientForNew(ctx, args.clientId)) };
    const contactRef = args.contactRef.trim().slice(0, 100);
    if (!contactRef) throw userError("Choose a lead.");
    if (await isPaused(ctx, scope, contactRef)) return null;
    const id = await ctx.db.insert("dealmakerPauses", { ...scope, contactRef, reason: args.reason.trim().slice(0, MAX_REASON) || "Paused by a person.", pausedBy: ctx.identity.subject, pausedAt: Date.now() });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "dealmaker.lead_paused", subject: id });
    return id;
  },
});

/** A person lifts a pause. Dealmaker never lifts one itself. */
export const liftPause = workspaceMutation({
  args: { pauseId: v.id("dealmakerPauses") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.pauseId);
    if (!row || row.workspaceId !== ctx.workspaceId || row.liftedAt !== undefined) notFound();
    ctx.clients.require(row.clientId);
    await ctx.db.patch(row._id, { liftedBy: ctx.identity.subject, liftedAt: Date.now() });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "dealmaker.lead_unpaused", subject: row._id });
    return null;
  },
});

/** The caller's home: their sales role and the deals it shows, as counts by stage. No names are stored. */
export const myHome = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const scope = await readScope(ctx, args.clientId);
    const [settings, crm] = await Promise.all([settingsOf(ctx, scope), crmFor(ctx, scope)]);
    const row = (settings?.team ?? []).find((item) => item.memberId === ctx.member._id) as TeamRow | undefined;
    const deals = crm ? await crm.deals() : [];
    const pipelines = crm ? await crm.pipelines() : [];
    const stageName = new Map(pipelines.flatMap((pipeline) => pipeline.stages.map((stage) => [stage.ref, stage.name] as const)));
    const scopeOf = dealScope(ctx.member.role, row);
    const mine = inScope(scopeOf, deals).filter((deal) => deal.status === "open");
    const byStage = new Map<string, number>();
    for (const deal of mine) byStage.set(deal.stageRef ?? "", (byStage.get(deal.stageRef ?? "") ?? 0) + 1);
    return {
      salesRole: row?.salesRole ?? null,
      focus: row ? SALES_ROLE_LABEL[row.salesRole].home : null,
      scope: scopeOf.kind,
      why: scopeOf.why,
      crmConnected: !!crm,
      openDeals: mine.length,
      byStage: [...byStage.entries()].map(([ref, count]) => ({ stage: stageName.get(ref) ?? "No stage", count })),
    };
  },
});
