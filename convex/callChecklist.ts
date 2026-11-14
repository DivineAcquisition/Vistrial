/**
 * The live checklist during a booked call (build step 12c). Built in code from the Playbook's script steps,
 * the call's brief and the objections heard on the business's own calls (with a talk track once a person
 * approved it). The closer ticks items as they go; ticks are kept per call. It does not listen to the call.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { clientForNew, clientHere, type ClientScope } from "./lib/clients";
import { crmFor } from "./lib/crm/read";
import { buildChecklist, itemIds } from "./lib/dealmaker/checklist";
import { objectionPlaybook } from "./lib/dealmaker/objections";
import { heardCalls } from "./lib/dealmaker/objectionCalls";
import { dealScope, type TeamRow } from "./lib/dealmaker/roles";
import { notFound } from "./lib/errors";
import { itemsOf, type Stage } from "./lib/playbook";
import { requireWork } from "./lib/roles";
import { settingsOf } from "./playbookInterview";

type Scope = { workspaceId: Id<"workspaces">; clientId?: Id<"clients"> };
type Ctx = QueryCtx & { workspaceId: Id<"workspaces">; clients: ClientScope; member: Doc<"members"> };

const DAY = 86_400_000;
/** The calls a checklist can be opened for: from yesterday to a week ahead. */
const WINDOW = { back: 1, ahead: 7 } as const;

async function readScope(ctx: Ctx, clientId: Id<"clients"> | undefined): Promise<Scope> {
  if (!clientId) {
    ctx.clients.require(undefined);
    return { workspaceId: ctx.workspaceId };
  }
  const client = await clientHere(ctx, ctx.workspaceId, clientId);
  ctx.clients.require(client._id);
  return { workspaceId: ctx.workspaceId, clientId: client._id };
}

/** The booked call, if it is one this person's home shows: every call, or the calls on their own deals. */
async function callFor(ctx: Ctx, scope: Scope, appointmentRef: string) {
  const crm = await crmFor(ctx, scope);
  if (!crm) return null;
  const now = Date.now();
  const call = (await crm.appointments({ from: now - WINDOW.back * DAY, to: now + WINDOW.ahead * DAY })).find((row) => row.ref === appointmentRef);
  if (!call?.contactRef) return null;
  const settings = await settingsOf(ctx, scope);
  const home = dealScope(ctx.member.role, (settings?.team ?? []).find((item) => item.memberId === ctx.member._id) as TeamRow | undefined);
  if (home.kind === "none") return null;
  if (home.kind !== "all") {
    const deals = (await crm.deals()).filter((deal) => deal.contactRef === call.contactRef);
    if (!deals.some((deal) => deal.ownerRef === home.crmUserRef)) return null;
  }
  const contact = await crm.contact(call.contactRef);
  return { call, leadName: contact?.name ?? "A lead", timezone: crm.connection.timezone ?? null };
}

async function ticksOf(ctx: Pick<QueryCtx, "db">, scope: Scope, appointmentRef: string) {
  return (
    await ctx.db
      .query("callChecklists")
      .withIndex("by_workspace_appointment", (q) => q.eq("workspaceId", scope.workspaceId).eq("appointmentRef", appointmentRef))
      .collect()
  ).find((row) => row.clientId === scope.clientId);
}

/** The checklist for one booked call, with what is ticked. */
export const forCall = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")), appointmentRef: v.string() },
  handler: async (ctx, args) => {
    const scope = await readScope(ctx, args.clientId);
    const found = await callFor(ctx, scope, args.appointmentRef);
    if (!found) notFound();
    const items = await itemsOf(ctx, scope);
    const steps = items.filter((row) => row.kind === "scriptStep").map((row) => ({ id: row._id as string, stage: (row.stage ?? null) as Stage | null, title: row.title }));

    // The latest brief for this call.
    const briefs = (
      await ctx.db
        .query("dealBriefings")
        .withIndex("by_workspace_appointment", (q) => q.eq("workspaceId", ctx.workspaceId).eq("appointmentRef", args.appointmentRef))
        .collect()
    )
      .filter((row) => row.clientId === scope.clientId)
      .sort((a, b) => b.createdAt - a.createdAt);
    const brief = briefs[0] ?? null;
    const briefState = brief?.status === "ready" && brief.view ? ("ready" as const) : brief?.status === "running" ? ("running" as const) : ("none" as const);

    // The objections heard on the business's own calls, with a talk track only once a person approved it.
    const objectionItems = items.filter((row) => row.kind === "objection");
    const heard = objectionPlaybook({ items: objectionItems.map((row) => ({ id: row._id, title: row.title, tag: row.tag ?? null, starter: row.source.type === "starter" })), calls: await heardCalls(ctx, scope), showLeads: false, showReps: false });
    const runs = await ctx.db
      .query("objectionRuns")
      .withIndex("by_workspace_client", (q) => q.eq("workspaceId", ctx.workspaceId).eq("clientId", scope.clientId))
      .order("desc")
      .take(20);
    const source = runs.find((row) => row.status === "ready" && row.checksPassed && row.tracks?.length) ?? null;
    const approved = source?.assetId ? (await ctx.db.get(source.assetId))?.status === "approved" : false;
    const tracks = new Map(approved ? (source?.tracks ?? []).map((row) => [row.itemId as string, row.track]) : []);

    const list = buildChecklist({ steps, brief: brief?.view ?? null, briefState, objections: heard.rows.map((row) => ({ title: row.title, heard: row.heard, track: tracks.get(row.itemId as string) ?? null })) });
    const ticked = new Set((await ticksOf(ctx, scope, args.appointmentRef))?.ticked ?? []);
    const valid = itemIds(list);
    return {
      leadName: found.leadName,
      startsAt: found.call.startsAt,
      timezone: found.timezone,
      ...list,
      ticked: [...ticked].filter((id) => valid.has(id)),
      canTick: ctx.role !== "viewer",
    };
  },
});

/** Ticks or unticks one item of a call's checklist. Only items on the list can be ticked. */
export const tick = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")), appointmentRef: v.string(), itemId: v.string(), on: v.boolean() },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
    const forClient = await clientForNew(ctx, args.clientId);
    const scope: Scope = { workspaceId: ctx.workspaceId, ...forClient };
    if (!(await callFor(ctx, scope, args.appointmentRef))) notFound();
    if (!/^(script|open|cover|ask|objection|promise):[A-Za-z0-9_-]{1,64}$/.test(args.itemId)) notFound();
    const row = await ticksOf(ctx, scope, args.appointmentRef);
    const now = Date.now();
    if (!row) {
      if (args.on) await ctx.db.insert("callChecklists", { ...scope, appointmentRef: args.appointmentRef.slice(0, 100), ticked: [args.itemId], by: ctx.identity.subject, updatedAt: now });
      return null;
    }
    const ticked = new Set(row.ticked);
    if (args.on) ticked.add(args.itemId);
    else ticked.delete(args.itemId);
    await ctx.db.patch(row._id, { ticked: [...ticked].slice(0, 100), by: ctx.identity.subject, updatedAt: now });
    return null;
  },
});
