import { v } from "convex/values";

import { denied, requireAccess, type Access } from "./access";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  BRIEFING_HISTORY_DAYS,
  DEFAULT_OUTCOME_METRICS,
  isOutcomeMetric,
  isSectionId,
  resolveVisit,
  type VisitState,
} from "./homeRules";

type WorkspaceAccess = Extract<Access, { principal: "user"; scope: "workspace" }>;
type Ctx = QueryCtx | MutationCtx;

const MAX_SNOOZE_MS = 7 * 86_400_000;

async function homeRow(ctx: Ctx, workspaceId: string): Promise<Doc<"workspaceHome"> | null> {
  return await ctx.db
    .query("workspaceHome")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .unique();
}

async function memberRow(ctx: Ctx, access: WorkspaceAccess): Promise<Doc<"memberHome"> | null> {
  return await ctx.db
    .query("memberHome")
    .withIndex("by_workspace_user", (q) => q.eq("workspaceId", access.workspaceId).eq("userId", access.userId))
    .unique();
}

async function ensureMember(ctx: MutationCtx, access: WorkspaceAccess, now: number): Promise<Doc<"memberHome">> {
  const existing = await memberRow(ctx, access);
  if (existing) return existing;
  const id = await ctx.db.insert("memberHome", {
    workspaceId: access.workspaceId,
    userId: access.userId,
    collapsed: [],
    workOrder: "best",
    workScope: "auto",
    lastVisitAt: null,
    visitDay: null,
    sinceAt: null,
    briefingSeenDay: null,
    firstSeenAt: now,
    welcomeDismissedAt: null,
  });
  return (await ctx.db.get(id))!;
}

function visitState(row: Doc<"memberHome"> | null): VisitState | null {
  if (!row) return null;
  return { lastVisitAt: row.lastVisitAt, visitDay: row.visitDay, sinceAt: row.sinceAt, briefingSeenDay: row.briefingSeenDay };
}

function isStaff(access: WorkspaceAccess): boolean {
  return access.role === "service_team" || access.role === "platform_admin";
}

/** Everything Home needs from Convex in one read. Only the caller's own rows. */
export const state = query({
  args: { workspaceId: v.string(), day: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    const [home, member] = await Promise.all([homeRow(ctx, args.workspaceId), memberRow(ctx, access)]);
    const snoozes = (
      await ctx.db
        .query("workSnoozes")
        .withIndex("by_workspace_user", (q) => q.eq("workspaceId", args.workspaceId).eq("userId", access.userId))
        .take(500)
    ).filter((row) => row.until > args.now);
    const briefings = (
      await ctx.db
        .query("briefings")
        .withIndex("by_workspace_user_day", (q) => q.eq("workspaceId", args.workspaceId).eq("userId", access.userId))
        .order("desc")
        .take(BRIEFING_HISTORY_DAYS)
    ).map((row) => ({ day: row.day, sinceAt: row.sinceAt, facts: row.facts }));
    return {
      enabled: home?.enabled ?? false,
      outcomeMetrics: home?.outcomeMetrics.filter(isOutcomeMetric) ?? DEFAULT_OUTCOME_METRICS,
      prefs: {
        collapsed: member?.collapsed.filter(isSectionId) ?? [],
        workOrder: member?.workOrder ?? "best",
        workScope: member?.workScope ?? "auto",
        firstSeenAt: member?.firstSeenAt ?? null,
        welcomeDismissedAt: member?.welcomeDismissedAt ?? null,
      },
      visit: resolveVisit(visitState(member), args.now, args.day),
      snoozedLeadIds: snoozes.map((row) => row.leadId),
      briefings,
    };
  },
});

/** Called once the page has painted. Returns the same window the page used. */
export const recordVisit = mutation({
  args: { workspaceId: v.string(), day: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    const member = await ensureMember(ctx, access, args.now);
    const result = resolveVisit(member.lastVisitAt === null ? null : visitState(member), args.now, args.day);
    await ctx.db.patch(member._id, {
      lastVisitAt: result.next.lastVisitAt,
      visitDay: result.next.visitDay,
      sinceAt: result.next.sinceAt,
    });
    return result;
  },
});

export const markBriefingSeen = mutation({
  args: { workspaceId: v.string(), day: v.string() },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    const member = await ensureMember(ctx, access, Date.now());
    await ctx.db.patch(member._id, { briefingSeenDay: args.day });
  },
});

/** Keeps today's facts and the two days before. Facts are counts and lead ids, never text. */
export const saveBriefing = mutation({
  args: { workspaceId: v.string(), day: v.string(), sinceAt: v.union(v.number(), v.null()), facts: v.any() },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    const rows = await ctx.db
      .query("briefings")
      .withIndex("by_workspace_user_day", (q) => q.eq("workspaceId", args.workspaceId).eq("userId", access.userId))
      .order("desc")
      .take(20);
    const today = rows.find((row) => row.day === args.day);
    if (today) {
      await ctx.db.patch(today._id, { sinceAt: args.sinceAt, facts: args.facts, savedAt: Date.now() });
    } else {
      await ctx.db.insert("briefings", {
        workspaceId: args.workspaceId,
        userId: access.userId,
        day: args.day,
        sinceAt: args.sinceAt,
        facts: args.facts,
        savedAt: Date.now(),
      });
    }
    const keep = new Set([args.day, ...rows.map((row) => row.day)].sort().reverse().slice(0, BRIEFING_HISTORY_DAYS));
    for (const row of rows) if (!keep.has(row.day)) await ctx.db.delete(row._id);
  },
});

export const setCollapsed = mutation({
  args: { workspaceId: v.string(), section: v.string(), collapsed: v.boolean() },
  handler: async (ctx, args) => {
    if (!isSectionId(args.section)) denied();
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    const member = await ensureMember(ctx, access, Date.now());
    const rest = member.collapsed.filter((id) => id !== args.section);
    await ctx.db.patch(member._id, { collapsed: args.collapsed ? [...rest, args.section] : rest });
  },
});

export const setWorkView = mutation({
  args: {
    workspaceId: v.string(),
    order: v.optional(v.union(v.literal("best"), v.literal("oldest"))),
    scope: v.optional(v.union(v.literal("mine"), v.literal("everyone"))),
  },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    if (args.scope === "everyone" && access.role === "operator") denied();
    const member = await ensureMember(ctx, access, Date.now());
    await ctx.db.patch(member._id, {
      ...(args.order ? { workOrder: args.order } : {}),
      ...(args.scope ? { workScope: args.scope } : {}),
    });
  },
});

export const dismissWelcome = mutation({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    const member = await ensureMember(ctx, access, Date.now());
    await ctx.db.patch(member._id, { welcomeDismissedAt: Date.now() });
  },
});

/** Hides a lead from this person's Work next only. Nobody else's list changes. */
export const snoozeLead = mutation({
  args: { workspaceId: v.string(), leadId: v.string(), until: v.number() },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    const now = Date.now();
    const until = Math.min(args.until, now + MAX_SNOOZE_MS);
    if (until <= now) denied();
    const existing = await ctx.db
      .query("workSnoozes")
      .withIndex("by_workspace_user_lead", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", access.userId).eq("leadId", args.leadId),
      )
      .unique();
    if (existing) await ctx.db.patch(existing._id, { until });
    else await ctx.db.insert("workSnoozes", { workspaceId: args.workspaceId, userId: access.userId, leadId: args.leadId, until });
  },
});

/** The per-workspace switch for Private Access. Vistrial staff only. */
export const setEnabled = mutation({
  args: { workspaceId: v.string(), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    if (!isStaff(access)) denied();
    const row = await homeRow(ctx, args.workspaceId);
    const stamp = { enabled: args.enabled, changedBy: access.userId, changedAt: Date.now() };
    if (row) await ctx.db.patch(row._id, stamp);
    else await ctx.db.insert("workspaceHome", { workspaceId: args.workspaceId, outcomeMetrics: DEFAULT_OUTCOME_METRICS, ...stamp });
  },
});

/** Owners (and staff) pick up to four numbers from the allowed list. */
export const setOutcomeMetrics = mutation({
  args: { workspaceId: v.string(), metrics: v.array(v.string()) },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, { scope: "workspace", workspaceId: args.workspaceId });
    if (access.role !== "owner" && !isStaff(access)) denied();
    const metrics = [...new Set(args.metrics)];
    if (metrics.length < 1 || metrics.length > 4 || !metrics.every(isOutcomeMetric)) denied();
    const row = await homeRow(ctx, args.workspaceId);
    const stamp = { outcomeMetrics: metrics, changedBy: access.userId, changedAt: Date.now() };
    if (row) await ctx.db.patch(row._id, stamp);
    else await ctx.db.insert("workspaceHome", { workspaceId: args.workspaceId, enabled: false, ...stamp });
  },
});
