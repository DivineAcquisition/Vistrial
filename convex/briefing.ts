/**
 * The Briefing: one feed of what needs a decision, what finished, what changed and what to read. Posts are
 * written where things happen (lib/briefing.ts); this module reads the feed, marks it seen, and sweeps for
 * the alerts nothing else announces: a check-in that came due, a connection that broke, results that
 * dropped, credits running low.
 *
 * A Member or Viewer only ever sees posts about the clients they are assigned to: the feed is read through
 * the builders, and `briefingItems` is on the client guard's list.
 */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { approvalView } from "./approvals";
import { accountFor, billingOn } from "./lib/billing";
import { post } from "./lib/briefing";
import { selfMutation, workspaceQuery } from "./lib/builders";
import { creditWords } from "./lib/credits";
import { BRIEFING_KINDS, briefingKind, type BriefingKind } from "./lib/taskShapes";
import { markOfRef } from "./lib/modelMarks";

const FEED_LIMIT = 150;
const PREVIEW_CHARS = 1400;
const DAY_MS = 24 * 60 * 60 * 1000;

export const KIND_LABEL: Record<BriefingKind, string> = {
  approval: "Approval",
  draft: "Draft to review",
  weeklyReport: "Weekly growth report",
  finished: "Finished work",
  alert: "Alert",
  trend: "Industry trend",
};

type Reader = { db: QueryCtx["db"]; workspaceId: Id<"workspaces"> };

/** Where a post's subject can be opened. Null when it has no page of its own. */
async function hrefOf(ctx: Reader, item: Doc<"briefingItems">): Promise<string | null> {
  if (!item.refTable || !item.refId) return null;
  if (item.refTable === "assets") return `/app/assets/${item.refId}`;
  if (item.refTable === "agentRuns") return `/app/runs/${item.refId}`;
  if (item.refTable === "agentTasks") return "/app/tasks";
  if (item.refTable === "browserSteps") return "/app/connections/browser";
  if (item.refTable === "billing") return "/app/billing";
  if (item.refTable === "connections") return "/app/settings?section=data";
  if (item.refTable === "resultUploads") return "/app/connections/results";
  if (item.refTable === "decisions") {
    const id = ctx.db.normalizeId("decisions", item.refId);
    const decision = id ? await ctx.db.get(id) : null;
    if (!decision || decision.workspaceId !== ctx.workspaceId) return null;
    return decision.assetId ? `/app/assets/${decision.assetId}` : `/app/agents/growth-architect/sessions/${decision.projectId}`;
  }
  return null;
}

/** The opening of a written draft, so it can be read in the feed. Reports store their text as JSON with a summary. */
function previewOf(body: string | undefined): string | null {
  if (!body) return null;
  let text = body;
  if (body.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      const picked = [parsed.summary, parsed.headline, parsed.overview].find((value) => typeof value === "string" && value.trim());
      if (typeof picked !== "string") return null;
      text = picked;
    } catch {
      return null;
    }
  }
  const clean = text.trim();
  return clean ? (clean.length > PREVIEW_CHARS ? `${clean.slice(0, PREVIEW_CHARS).trimEnd()}…` : clean) : null;
}

async function draftPreview(ctx: Reader, item: Doc<"briefingItems">) {
  if (item.kind !== "draft" || item.refTable !== "assets" || !item.refId) return null;
  const id = ctx.db.normalizeId("assets", item.refId);
  const asset = id ? await ctx.db.get(id) : null;
  if (!asset || asset.workspaceId !== ctx.workspaceId) return null;
  const version = await ctx.db
    .query("assetVersions")
    .withIndex("by_workspace_asset", (q) => q.eq("workspaceId", ctx.workspaceId).eq("assetId", asset._id))
    .filter((q) => q.eq(q.field("version"), asset.currentVersion))
    .first();
  return { text: previewOf(version?.body), version: asset.currentVersion, needsReview: asset.status === "needsReview" };
}

/**
 * The feed, newest first, optionally one kind or one agent. Each post carries its approval when it has
 * one, so it can be decided in place by someone who may. `unread` counts posts since the person last
 * opened the Briefing.
 */
export const feed = workspaceQuery({
  args: { kind: v.optional(briefingKind), agentSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("briefingItems")
      .withIndex("by_workspace_at", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(FEED_LIMIT);
    const visit = await ctx.db
      .query("memberVisits")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", ctx.workspaceId).eq("userId", ctx.identity.subject))
      .unique();
    const seenAt = visit?.briefingSeenAt ?? 0;
    const names = new Map<string, string>();
    const counts = Object.fromEntries(BRIEFING_KINDS.map((kind) => [kind, 0])) as Record<BriefingKind, number>;
    const agents = new Set<string>();
    const items = [];
    for (const row of rows) {
      counts[row.kind] += 1;
      if (row.agentSlug) agents.add(row.agentSlug);
      if ((args.kind && row.kind !== args.kind) || (args.agentSlug && row.agentSlug !== args.agentSlug)) continue;
      if (row.clientId && !names.has(row.clientId)) names.set(row.clientId, (await ctx.db.get(row.clientId))?.name ?? "A client");
      const approval = row.approvalId ? await ctx.db.get(row.approvalId) : null;
      items.push({
        id: row._id,
        kind: row.kind,
        kindLabel: KIND_LABEL[row.kind],
        agentSlug: row.agentSlug ?? null,
        client: row.clientId ? (names.get(row.clientId) ?? null) : null,
        title: row.title,
        body: row.body ?? null,
        at: row.at,
        unread: row.at > seenAt,
        href: await hrefOf(ctx, row),
        sources: row.sources ?? [],
        credits: row.credits ?? null,
        /** The model behind a post about a run or about something a run made. Null for every other post. */
        model: await markOfRef(ctx, ctx.workspaceId, row.refTable, row.refId),
        approval: approval && approval.workspaceId === ctx.workspaceId ? await approvalView(ctx, approval) : null,
        draft: await draftPreview(ctx, row),
      });
    }
    return { items, counts, agents: [...agents].sort(), unread: rows.filter((row) => row.at > seenAt).length, total: rows.length };
  },
});

/** Marks the Briefing as read up to now, for the caller only. Any member, a Viewer included. */
export const markSeen = selfMutation({
  args: {},
  handler: async (ctx) => {
    const visit = await ctx.db
      .query("memberVisits")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", ctx.workspaceId).eq("userId", ctx.identity.subject))
      .unique();
    const now = Date.now();
    if (visit) await ctx.db.patch(visit._id, { briefingSeenAt: now });
    else await ctx.db.insert("memberVisits", { workspaceId: ctx.workspaceId, userId: ctx.identity.subject, briefingSeenAt: now });
    return null;
  },
});

// ------------------------------------------------------------------------------------------- alerts

/** Below this many credits the Briefing says so, once a week. About one research session at its cap. */
export const LOW_CREDITS = 1000;
/** A results file whose conversions are this far below the file before it, for the same source, is posted as a drop. */
export const DROP_PERCENT = 20;

const weekKey = (time: number) => {
  const date = new Date(time);
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return `${date.getUTCFullYear()}-W${String(Math.floor((time - start) / (7 * DAY_MS)) + 1).padStart(2, "0")}`;
};

/** The alerts for one organization. Each has a key, so it is posted once however often the sweep runs. */
export async function alertsFor(ctx: MutationCtx, workspace: Doc<"workspaces">) {
  const workspaceId = workspace._id;
  const now = Date.now();

  // A check-in is due.
  const due = await ctx.db
    .query("decisions")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId).lte("checkInAt", now))
    .take(50);
  for (const decision of due) {
    if (decision.outcome) continue;
    await post(ctx, { workspaceId, clientId: decision.clientId, kind: "alert", title: "A check-in is due", body: `You said you would try this: ${decision.proposedAction} Say what happened, and the next proposal builds on it.`, ref: { table: "decisions", id: decision._id }, key: `checkin:${decision._id}` });
  }

  // A connection broke.
  const meta = await ctx.db.query("metaConnections").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).take(20);
  for (const row of meta) {
    if (row.status === "needsReconnect") await post(ctx, { workspaceId, clientId: row.clientId, kind: "alert", title: "Meta ads needs reconnecting", body: "Results from Meta have stopped updating. An Owner or Admin can reconnect it in Settings, Data.", ref: { table: "connections", id: row._id }, key: `connection:${row._id}:${row.connectedAt ?? 0}` });
  }
  const others = await ctx.db.query("integrationConnections").withIndex("by_workspace_provider", (q) => q.eq("workspaceId", workspaceId)).take(50);
  for (const row of others) {
    if (row.status === "needsReconnect") await post(ctx, { workspaceId, clientId: row.clientId, kind: "alert", title: "A connected account needs reconnecting", body: "One of your connected accounts has stopped updating. An Owner or Admin can reconnect it in Settings, Data.", ref: { table: "connections", id: row._id }, key: `connection:${row._id}:${row.connectedAt ?? 0}` });
  }

  // Results dropped: the newest results file against the one before it, for the same source and client.
  const uploads = (await ctx.db.query("resultUploads").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(40)).filter((row) => row.status === "ready" && row.summary);
  const bySource = new Map<string, Doc<"resultUploads">[]>();
  for (const upload of uploads) {
    const source = `${upload.clientId ?? "own"}:${upload.label}`;
    bySource.set(source, [...(bySource.get(source) ?? []), upload]);
  }
  for (const [later, earlier] of bySource.values()) {
    const before = earlier?.summary?.totals.conversions;
    const after = later.summary?.totals.conversions;
    if (before === undefined || after === undefined || before <= 0) continue;
    const percent = Math.round(((after - before) / before) * 100);
    if (percent > -DROP_PERCENT) continue;
    const posted = await post(ctx, { workspaceId, clientId: later.clientId, kind: "alert", title: `Results dropped: ${later.label}`, body: `Conversions went from ${before.toLocaleString("en-US")} to ${after.toLocaleString("en-US")} (${percent}%) between the last two results files.`, ref: { table: "resultUploads", id: later._id }, key: `drop:${later._id}` });
    // Results dropping is something real that changed. Only the first time it is seen.
    if (posted) await ctx.scheduler.runAfter(0, internal.planner.changed, { workspaceId, key: `drop:${later._id}` });
  }

  // Credits are running low. Once a week, and only where billing is on.
  if (billingOn()) {
    const account = await accountFor(ctx, workspaceId);
    const balance = account?.balanceCents ?? 0;
    if (balance <= LOW_CREDITS) {
      await post(ctx, { workspaceId, kind: "alert", title: balance <= 0 ? "You are out of credits" : "Credits are running low", body: `${creditWords(Math.max(0, balance))} left in the shared balance. An Owner can add credits in Billing.`, ref: { table: "billing", id: "balance" }, key: `credits:${weekKey(now)}:${balance <= 0 ? "empty" : "low"}` });
    }
  }
}

const SWEEP_PAGE = 50;

/** Looks at every active organization for alerts, a page at a time. Run hourly. */
export const sweep = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("workspaces").paginate({ numItems: SWEEP_PAGE, cursor: args.cursor ?? null });
    for (const workspace of page.page) {
      if (workspace.status === "active") await alertsFor(ctx, workspace);
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.briefing.sweep, { cursor: page.continueCursor });
    return null;
  },
});
