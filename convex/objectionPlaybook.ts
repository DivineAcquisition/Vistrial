/**
 * The Objection Playbook in the Playbook's Objections folder (Dealmaker; docs/rebuild/dealmaker.md, 0.8 and 4.5).
 * This part is code only: the counts, the lead's own words, what was said back on calls that later closed, and
 * per rep for the Owner, worked out from the passing call reviews and the closer's notes each time it is read.
 * The figures live in lib/dealmaker/objections.ts.
 *
 * People can add the starter set (labelled "not yet heard on your calls") and add an objection heard on a call
 * that the Playbook does not hold yet. Neither reaches a lead.
 *
 * The talk tracks are model work (skills/objectionPlaybook): on request, or weekly once the Owner turns that on
 * with the cap shown. Both need at least five calls. Each run's tracks wait for a person's review, and are shown
 * as an untested hypothesis.
 */

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { SALES_CONVERSION } from "./catalog";
import { writeAudit } from "./lib/audit";
import { priceFor } from "./lib/billing";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { clientForNew, clientHere, type ClientScope } from "./lib/clients";
import { notFound, userError } from "./lib/errors";
import { heardCalls } from "./lib/dealmaker/objectionCalls";
import { MIN_CALLS, STARTER_OBJECTIONS, titleKey, objectionPlaybook } from "./lib/dealmaker/objections";
import { dealScope, type TeamRow } from "./lib/dealmaker/roles";
import { capsFor, previewChoice, skillNeeds } from "./lib/modelChoice";
import { LIMITS, PLAYBOOK_TEXT, basisFor, clean, itemsOf, objectionTag } from "./lib/playbook";
import { isOwner, requireWork } from "./lib/roles";
import { weekKey } from "./planner";
import { startRunFor } from "./runs";
import { SKILL_SLUG } from "./skills/objectionPlaybook/shapes";
import { settingsOf } from "./playbookInterview";

type Ctx = QueryCtx & { workspaceId: Id<"workspaces">; clients: ClientScope };
type Scope = { workspaceId: Id<"workspaces">; clientId?: Id<"clients"> };

async function readScope(ctx: Ctx, clientId: Id<"clients"> | undefined): Promise<Scope> {
  if (!clientId) {
    ctx.clients.require(undefined);
    return { workspaceId: ctx.workspaceId };
  }
  const client = await clientHere(ctx, ctx.workspaceId, clientId);
  ctx.clients.require(client._id);
  return { workspaceId: ctx.workspaceId, clientId: client._id };
}

export const TRACK_TEXT = {
  notEnough: `Talk tracks need at least ${MIN_CALLS} calls reviewed or noted.`,
  noneHeard: "No objection in the Playbook has been heard on a call yet.",
  running: "Talk tracks are already being written.",
  budgetMoved: "The budget changed. Check the new one and confirm again.",
  ownerOnly: "Only an Owner can change the weekly talk tracks.",
} as const;

async function budgetCaps(ctx: QueryCtx & { workspaceId: Id<"workspaces">; identity: { subject: string } }) {
  const choice = await previewChoice(ctx, { workspaceId: ctx.workspaceId, userId: ctx.identity.subject, picked: undefined, needs: skillNeeds(SKILL_SLUG) });
  return capsFor(ctx, { workspaceId: ctx.workspaceId, agentSlug: SALES_CONVERSION, skillSlug: SKILL_SLUG, choice });
}

type TrackState = "running" | "ready" | "needsReview" | "failed";

async function stateOf(ctx: Pick<QueryCtx, "db">, row: Doc<"objectionRuns">): Promise<TrackState> {
  if (row.status === "ready") return row.checksPassed ? "ready" : "needsReview";
  if (row.status === "failed") return "failed";
  const run = row.runId ? await ctx.db.get(row.runId) : null;
  return run && run.status !== "queued" && run.status !== "running" ? "failed" : "running";
}

/** Whether talk tracks may be written for this Playbook now, and why not. */
async function readiness(ctx: Pick<QueryCtx, "db">, scope: Scope): Promise<string | null> {
  const items = (await itemsOf(ctx, scope)).filter((row) => row.kind === "objection");
  const figures = objectionPlaybook({ items: items.map((row) => ({ id: row._id, title: row.title, tag: row.tag ?? null, starter: row.source.type === "starter" })), calls: await heardCalls(ctx, scope), showLeads: false, showReps: false });
  if (!figures.enough) return `${TRACK_TEXT.notEnough} You have ${figures.calls}.`;
  if (!figures.rows.some((row) => row.heard > 0)) return TRACK_TEXT.noneHeard;
  const latest = await ctx.db
    .query("objectionRuns")
    .withIndex("by_workspace_client", (q) => q.eq("workspaceId", scope.workspaceId).eq("clientId", scope.clientId))
    .order("desc")
    .first();
  if (latest && (await stateOf(ctx, latest)) === "running") return TRACK_TEXT.running;
  return null;
}

/** Starts one talk-track run on its own project. A refused start leaves nothing behind. */
async function startTracks(ctx: MutationCtx, scope: Scope, by: { userId: string; role: string; unattended?: boolean }, trigger: "request" | "weekly", week?: string) {
  const now = Date.now();
  const projectId = await ctx.db.insert("researchProjects", {
    ...scope,
    title: "Objection playbook",
    objective: "Talk tracks for the objections leads raise on this business's calls.",
    market: "",
    geography: "",
    competitors: [],
    platforms: ["customerData"],
    suppliedUrls: [],
    status: "draft",
    createdBy: by.userId,
    createdAt: now,
    updatedAt: now,
  });
  let runId: Id<"agentRuns">;
  try {
    runId = await startRunFor(ctx, { workspaceId: scope.workspaceId, userId: by.userId, role: by.role, agentSlug: SALES_CONVERSION, skillSlug: SKILL_SLUG, projectId, ...(by.unattended ? { unattended: true } : {}) });
  } catch (error) {
    await ctx.db.delete(projectId);
    throw error;
  }
  const rowId = await ctx.db.insert("objectionRuns", { ...scope, projectId, trigger, ...(week ? { week } : {}), status: "running", runId, createdBy: by.userId, createdAt: now });
  return { rowId, runId };
}

/** The Objection Playbook for the organization or a client. */
export const view = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const scope = await readScope(ctx, args.clientId);
    const items = (await itemsOf(ctx, scope)).filter((row) => row.kind === "objection");
    const calls = await heardCalls(ctx, scope);
    const settings = await settingsOf(ctx, scope);
    const team = (settings?.team ?? []).find((item) => item.memberId === ctx.member._id) as TeamRow | undefined;
    // Leads' names are shown to those who see every deal; per rep, to the Owner only (0.8).
    const showLeads = dealScope(ctx.member.role, team).kind === "all";
    const result = objectionPlaybook({
      items: items.map((row) => ({ id: row._id, title: row.title, tag: row.tag ?? null, starter: row.source.type === "starter" })),
      calls,
      showLeads,
      showReps: ctx.role === "owner",
    });
    const held = new Set(items.map((row) => titleKey(row.title)));
    // The talk tracks: from the newest run that passed its checks. They show once a person approved them.
    const runs = await ctx.db
      .query("objectionRuns")
      .withIndex("by_workspace_client", (q) => q.eq("workspaceId", ctx.workspaceId).eq("clientId", scope.clientId))
      .order("desc")
      .take(20);
    const latest = runs[0] ?? null;
    const source = runs.find((row) => row.status === "ready" && row.checksPassed && row.tracks?.length) ?? null;
    const asset = source?.assetId ? await ctx.db.get(source.assetId) : null;
    const approved = asset?.status === "approved";
    const tracks = new Map((source?.tracks ?? []).map((row) => [row.itemId, row]));
    const heard = result.rows.some((row) => row.heard > 0);
    const caps = await budgetCaps(ctx);
    return {
      ...result,
      rows: result.rows.map((row) => {
        const track = tracks.get(row.itemId);
        return { ...row, track: track ? { text: track.track, offer: track.offer.map((item) => item.title), approved } : null };
      }),
      tracksState: latest ? await stateOf(ctx, latest) : null,
      tracksAt: source?.finishedAt ?? null,
      tracksAssetId: source?.assetId ?? null,
      canAskTracks: ctx.role !== "viewer" && result.enough && heard,
      tracksBlocked: !result.enough ? `${TRACK_TEXT.notEnough} You have ${result.calls}.` : !heard ? TRACK_TEXT.noneHeard : null,
      maxCredits: priceFor(caps.maxCostCentsPerRun),
      weekly: { on: settings?.objectionWeekly === true, canChange: ctx.role === "owner" },
      starterMissing: STARTER_OBJECTIONS.filter((row) => !held.has(titleKey(row.title))).length,
      canEdit: ctx.role !== "viewer",
      isOwner: ctx.role === "owner",
    };
  },
});

/** Adds the starter objections the Playbook does not hold yet, each labelled "not yet heard on your calls". */
export const addStarter = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const forClient = await clientForNew(ctx, args.clientId);
    const live = await itemsOf(ctx, { workspaceId: ctx.workspaceId, ...forClient });
    const held = new Set(live.filter((row) => row.kind === "objection").map((row) => titleKey(row.title)));
    const missing = STARTER_OBJECTIONS.filter((row) => !held.has(titleKey(row.title)));
    if (live.length + missing.length > LIMITS.items) throw userError(PLAYBOOK_TEXT.full);
    const now = Date.now();
    for (const row of missing) {
      await ctx.db.insert("playbookItems", {
        workspaceId: ctx.workspaceId,
        ...forClient,
        folder: "objections",
        kind: "objection",
        tag: row.tag,
        title: row.title,
        body: row.body,
        source: { type: "starter" },
        basis: basisFor("starter"),
        status: "active",
        createdBy: ctx.identity.subject,
        createdAt: now,
        updatedAt: now,
      });
    }
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "playbook.starter_objections_added", subject: forClient.clientId ?? ctx.workspaceId, count: missing.length });
    return missing.length;
  },
});

/**
 * A person adds an objection heard on a reviewed call to the Objections folder. It is filed as from that call;
 * the quote kept is the buyer's own words from the review, only when the review has them.
 */
export const addHeard = workspaceMutation({
  args: { reviewId: v.id("callReviews"), title: v.string(), tag: objectionTag },
  handler: async (ctx, args) => {
    const review = await ctx.db.get(args.reviewId);
    if (!review || review.workspaceId !== ctx.workspaceId || review.status !== "ready" || !review.view) notFound();
    ctx.clients.require(review.clientId);
    const title = clean(args.title, LIMITS.title);
    if (!title) throw userError(PLAYBOOK_TEXT.emptyTitle);
    const scope = { workspaceId: ctx.workspaceId, ...(review.clientId ? { clientId: review.clientId } : {}) };
    const live = await itemsOf(ctx, scope);
    if (live.length >= LIMITS.items) throw userError(PLAYBOOK_TEXT.full);
    const existing = live.find((row) => row.kind === "objection" && titleKey(row.title) === titleKey(title));
    if (existing) return existing._id;
    const said = review.view.objections.find((row) => titleKey(row.text) === titleKey(args.title) && row.kind === "Buyer's words");
    const now = Date.now();
    const id = await ctx.db.insert("playbookItems", {
      ...scope,
      folder: "objections",
      kind: "objection",
      tag: args.tag,
      title,
      body: "",
      ...(said ? { quote: said.quote } : {}),
      source: { type: "call", ref: review._id, label: `Call review: ${review.leadName}` },
      basis: basisFor("call"),
      status: "active",
      createdBy: ctx.identity.subject,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "playbook.item_added", subject: id });
    return id;
  },
});

/** The most one talk-track run may use, in credits, shown before a person confirms or the Owner turns on weekly runs. */
export const quote = workspaceQuery({
  args: {},
  handler: async (ctx) => ({ maxCredits: priceFor((await budgetCaps(ctx)).maxCostCentsPerRun) }),
});

/** A person asks for talk tracks now, after confirming the budget. Needs five calls and an objection heard. */
export const request = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")), confirmedCredits: v.number() },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
    const forClient = await clientForNew(ctx, args.clientId);
    if (args.confirmedCredits !== priceFor((await budgetCaps(ctx)).maxCostCentsPerRun)) throw userError(TRACK_TEXT.budgetMoved);
    const scope = { workspaceId: ctx.workspaceId, ...forClient };
    const blocked = await readiness(ctx, scope);
    if (blocked) throw userError(blocked);
    const started = await startTracks(ctx, scope, { userId: ctx.identity.subject, role: ctx.member.role }, "request");
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "objectionPlaybook.requested", subject: started.rowId });
    return started;
  },
});

/** The Owner's switch for weekly talk tracks. Off by default; the screen shows the cap before it is turned on. */
export const setWeekly = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")), on: v.boolean() },
  handler: async (ctx, args) => {
    if (ctx.role !== "owner") throw userError(TRACK_TEXT.ownerOnly);
    const forClient = await clientForNew(ctx, args.clientId);
    const scope = { workspaceId: ctx.workspaceId, ...forClient };
    const row = await settingsOf(ctx, scope);
    const stamp = { updatedBy: ctx.identity.subject, updatedAt: Date.now() };
    if (row) await ctx.db.patch(row._id, { objectionWeekly: args.on, ...stamp });
    else await ctx.db.insert("dealmakerSettings", { ...scope, objectionWeekly: args.on, ...stamp });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: args.on ? "objectionPlaybook.weekly_on" : "objectionPlaybook.weekly_off", subject: forClient.clientId ?? ctx.workspaceId });
    return null;
  },
});

/** Each Playbook reads its calls, so a page is small. */
const PAGE = 5;

/**
 * The weekly refresh: one talk-track run per Playbook whose Owner turned it on, once a week, in the Owner's name.
 * A Playbook without five calls, with nothing heard, or with a run already this week is left alone; so is any
 * refusal an ordinary run can meet (agents paused, Dealmaker off, out of credits, the day's cap reached).
 */
export const weekly = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const week = weekKey(Date.now());
    const page = await ctx.db.query("dealmakerSettings").paginate({ numItems: PAGE, cursor: args.cursor ?? null });
    for (const settings of page.page) {
      if (!settings.objectionWeekly) continue;
      const scope = { workspaceId: settings.workspaceId, ...(settings.clientId ? { clientId: settings.clientId } : {}) };
      const workspace = await ctx.db.get(settings.workspaceId);
      if (!workspace || workspace.status !== "active") continue;
      const done = await ctx.db
        .query("objectionRuns")
        .withIndex("by_workspace_client", (q) => q.eq("workspaceId", scope.workspaceId).eq("clientId", scope.clientId))
        .order("desc")
        .take(20);
      if (done.some((row) => row.week === week)) continue;
      if (await readiness(ctx, scope)) continue;
      const members = await ctx.db
        .query("members")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", scope.workspaceId))
        .take(200);
      const owner = members.find((row) => row.active && isOwner(row.role));
      if (!owner) continue;
      try {
        await startTracks(ctx, scope, { userId: owner.userId, role: owner.role, unattended: true }, "weekly", week);
      } catch (error) {
        if (!(error as { data?: { code?: string } }).data?.code) throw error;
      }
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.objectionPlaybook.weekly, { cursor: page.continueCursor });
    return null;
  },
});
