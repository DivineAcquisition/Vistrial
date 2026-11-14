/**
 * Dealmaker's proof and weekly scorecard (build step 18a; docs/rebuild/dealmaker.md, 0.3). Read from the
 * business's own CRM and Dealmaker's own records on every visit, and once a week posted to the Briefing as
 * three rows written in code: what moved, what Dealmaker did, what is next. Nothing here contacts anyone.
 */

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type QueryCtx } from "./_generated/server";
import { SALES_CONVERSION } from "./catalog";
import { post } from "./lib/briefing";
import { workspaceQuery } from "./lib/builders";
import { clientHere, type ClientScope } from "./lib/clients";
import { crmFor, type CrmView } from "./lib/crm/read";
import { buildBoard } from "./lib/dealmaker/board";
import { DAY, HOUR, MAX_WINDOW_DAYS, beforeAndAfter, dealsInvolved, scorecard, timeSaved, weekStart } from "./lib/dealmaker/proof";
import { boardInputFor } from "./pipelineBoard";

type Scope = { workspaceId: Id<"workspaces">; clientId?: Id<"clients"> };
type ReadCtx = QueryCtx & { workspaceId: Id<"workspaces">; clients: ClientScope };
const MESSAGE_KINDS = new Set(["send_sms", "send_email"]);

async function readScope(ctx: ReadCtx, clientId: Id<"clients"> | undefined): Promise<Scope> {
  if (!clientId) {
    ctx.clients.require(undefined);
    return { workspaceId: ctx.workspaceId };
  }
  const client = await clientHere(ctx, ctx.workspaceId, clientId);
  ctx.clients.require(client._id);
  return { workspaceId: ctx.workspaceId, clientId: client._id };
}

/** Dealmaker's link to this organization: whether it is on, and when it was first switched on. */
async function dealmakerLink(ctx: Pick<QueryCtx, "db">, workspaceId: Id<"workspaces">) {
  const agent = await ctx.db
    .query("agents")
    .withIndex("by_slug", (q) => q.eq("slug", SALES_CONVERSION))
    .unique();
  if (!agent) return null;
  return await ctx.db
    .query("workspaceAgents")
    .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", workspaceId).eq("agentId", agent._id))
    .unique();
}

/**
 * Dealmaker's own work here since `since`: briefs written, its own drafts that were sent, and CRM updates it
 * proposed that were done. With the leads and deals each touched, for "involved".
 */
async function workSince(ctx: Pick<QueryCtx, "db">, scope: Scope, crm: CrmView, since: number, until = Number.MAX_SAFE_INTEGER) {
  const mine = <T extends { clientId?: Id<"clients"> }>(row: T) => row.clientId === scope.clientId;
  const between = (at: number | undefined) => at !== undefined && at >= since && at < until;
  const briefs = (
    await ctx.db
      .query("dealBriefings")
      .withIndex("by_workspace_client", (q) => q.eq("workspaceId", scope.workspaceId).eq("clientId", scope.clientId))
      .order("desc")
      .take(2000)
  ).filter((row) => row.status === "ready" && between(row.createdAt));
  const drafts = (
    await ctx.db
      .query("dealmakerDrafts")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", scope.workspaceId).eq("status", "proposed"))
      .order("desc")
      .take(2000)
  ).filter((row) => mine(row) && row.createdBy === "agent");
  const actions = await ctx.db
    .query("crmActions")
    .withIndex("by_connection_state", (q) => q.eq("connectionId", crm.connection.id).eq("state", "done"))
    .take(5000);
  const done = new Map(actions.map((row) => [row._id, row]));
  const sent = drafts.flatMap((row) => {
    const action = row.actionId ? done.get(row.actionId) : undefined;
    return action && between(action.doneAt) ? [row] : [];
  });
  const updates = actions.filter((row) => row.proposedBy === "agent" && row.agentSlug === SALES_CONVERSION && !MESSAGE_KINDS.has(row.kind) && between(row.doneAt));
  const involved = { dealRefs: new Set<string>(), contactRefs: new Set<string>() };
  for (const row of briefs) {
    if (row.dealRef) involved.dealRefs.add(row.dealRef);
    else if (row.contactRef) involved.contactRefs.add(row.contactRef);
  }
  for (const row of sent) {
    if (row.dealRef) involved.dealRefs.add(row.dealRef);
    else involved.contactRefs.add(row.contactRef);
  }
  return { counts: { brief: briefs.length, message: sent.length, crmUpdate: updates.length }, involved };
}

/** The proof for the organization or a client: before and after, deals involved, time saved. */
export const summary = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const scope = await readScope(ctx, args.clientId);
    const crm = await crmFor(ctx, scope);
    if (!crm) return { connected: false as const };
    const now = Date.now();
    const link = await dealmakerLink(ctx, ctx.workspaceId);
    const onAt = link?.firstOnAt ?? null;
    const since = Math.min(onAt ?? now, now) - MAX_WINDOW_DAYS * DAY;
    const [deals, calls, contacts, activities] = await Promise.all([crm.deals(), crm.appointments({ from: since, to: now }), crm.contacts({ addedSince: since }), crm.activities({ since })]);
    const work = await workSince(ctx, scope, crm, onAt ?? now);
    return {
      connected: true as const,
      onAt,
      beforeAndAfter: beforeAndAfter({ now, onAt, deals, calls, contacts, activities }),
      involved: dealsInvolved(deals, work.involved, crm.connection.currency),
      saved: timeSaved(work.counts),
    };
  },
});

/** Posts last week's scorecard for each CRM connection whose organization has Dealmaker on. Run by a cron. */
export const weekly = internalMutation({
  args: {},
  handler: async (ctx) => {
    const connections = await ctx.db.query("crmConnections").take(1000);
    for (const row of connections) {
      if (row.status !== "connected") continue;
      const link = await dealmakerLink(ctx, row.workspaceId);
      if (link?.state !== "on") continue;
      await ctx.scheduler.runAfter(0, internal.dealmakerProof.postScorecard, { connectionId: row._id });
    }
    return null;
  },
});

/** The key that keeps a week's scorecard from being posted twice. */
export function scorecardKey(connectionId: Id<"crmConnections">, from: number) {
  return `dealmaker-scorecard:${connectionId}:${new Date(from).toISOString().slice(0, 10)}`;
}

/** Last full week (Monday to Monday, UTC) for one connection, posted to the Briefing once. */
export const postScorecard = internalMutation({
  args: { connectionId: v.id("crmConnections") },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return null;
    const scope: Scope = { workspaceId: connection.workspaceId, ...(connection.clientId ? { clientId: connection.clientId } : {}) };
    const crm = await crmFor(ctx, scope);
    if (!crm) return null;
    const now = Date.now();
    const to = weekStart(now);
    const from = to - 7 * DAY;
    const key = scorecardKey(connection._id, from);
    const existing = await ctx.db
      .query("briefingItems")
      .withIndex("by_workspace_key", (q) => q.eq("workspaceId", scope.workspaceId).eq("key", key))
      .first();
    if (existing) return null;
    const [deals, activities, upcoming] = await Promise.all([crm.deals(), crm.activities({ since: from, until: to }), crm.appointments({ from: now, to: now + 24 * HOUR })]);
    const work = await workSince(ctx, scope, crm, from, to);
    const board = buildBoard(await boardInputFor(ctx, scope, crm, now));
    const briefed = new Set(
      (
        await ctx.db
          .query("dealBriefings")
          .withIndex("by_workspace_client", (q) => q.eq("workspaceId", scope.workspaceId).eq("clientId", scope.clientId))
          .order("desc")
          .take(500)
      ).flatMap((row: Doc<"dealBriefings">) => (row.appointmentRef ? [row.appointmentRef] : [])),
    );
    const drafts = (
      await ctx.db
        .query("dealmakerDrafts")
        .withIndex("by_workspace_status", (q) => q.eq("workspaceId", scope.workspaceId).eq("status", "draft"))
        .take(500)
    ).filter((row) => row.clientId === scope.clientId);
    const card = scorecard({
      from,
      to,
      currency: crm.connection.currency,
      deals,
      stageMoves: activities.filter((row) => row.kind === "stage_change").length,
      work: work.counts,
      movesWaiting: board.moves.length,
      briefsDue: upcoming.filter((call) => call.status !== "cancelled" && !briefed.has(call.ref)).length,
      draftsWaiting: drafts.length,
    });
    await post(ctx, {
      workspaceId: scope.workspaceId,
      ...(scope.clientId ? { clientId: scope.clientId } : {}),
      kind: "weeklyReport",
      agentSlug: SALES_CONVERSION,
      title: `Dealmaker · Week of ${new Date(from).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`,
      digest: { changed: card.moved, means: card.did, todo: card.next, firstParty: true },
      key,
    });
    return null;
  },
});
