/**
 * When the planned work runs: the task proposer and the monthly industry trend reading. Weekly, for every organization that has the weekly plan on; and when
 * something real changes: a report is approved, a check-in comes back, results drop. Each start is an
 * ordinary run of the "task-proposer" skill, so the organization's pause, the skill's caps and the credit
 * balance all apply, and what it used is on the run and in the ledger like any other work.
 *
 * A run is started in the name of the organization's Owner, because a run needs a member who is still
 * active; nobody is charged or notified as that person.
 */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { GROWTH_ARCHITECT } from "./catalog";
import { settingsOf } from "./lib/briefing";
import { isOwner } from "./lib/roles";
import { startRunFor } from "./runs";
import { SKILL_SLUG as TRENDS_SKILL, monthKey } from "./skills/industryTrends/shapes";
import { SKILL_SLUG } from "./skills/taskProposer/shapes";

const DAY_MS = 24 * 60 * 60 * 1000;
/** The most proposals-on-change one organization gets in a day, on top of the skill's credit cap. */
export const MAX_CHANGE_RUNS_PER_DAY = 3;

/** "2026-W46": the ISO-style week a time falls in, counted in UTC from Monday. */
export function weekKey(time: number) {
  const date = new Date(time);
  const day = (date.getUTCDay() + 6) % 7;
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day + 3));
  const first = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((thursday.getTime() - first.getTime()) / DAY_MS - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function recentRuns(ctx: MutationCtx, workspaceId: Id<"workspaces">, skillSlug: string = SKILL_SLUG) {
  const runs = await ctx.db.query("agentRuns").withIndex("by_workspace_agent", (q) => q.eq("workspaceId", workspaceId).eq("agentSlug", GROWTH_ARCHITECT)).order("desc").take(200);
  return runs.filter((row) => row.skillSlug === skillSlug);
}

/** Starts a planned run in the Owner's name. A refusal meant for a person (out of credits, the agent is off) is a reason not to run, not a failure. */
async function startAsOwner(ctx: MutationCtx, workspaceId: Id<"workspaces">, skillSlug: string, inputRef: string): Promise<{ started: boolean; reason?: string }> {
  const members = await ctx.db.query("members").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).take(200);
  const owner = members.find((row) => row.active && isOwner(row.role));
  if (!owner) return { started: false, reason: "no_owner" };
  try {
    await startRunFor(ctx, { workspaceId, userId: owner.userId, role: owner.role, agentSlug: GROWTH_ARCHITECT, skillSlug, inputRef, unattended: true });
    return { started: true };
  } catch (error) {
    const data = (error as { data?: { code?: string } }).data;
    if (data?.code) return { started: false, reason: data.code };
    throw error;
  }
}

/**
 * Starts one proposer run for a plan key, unless one was already started for it. Returns why not when it
 * does not start: every refusal an ordinary run can meet (agents paused, the agent off, out of credits,
 * the day's cap reached) simply means no plan this time.
 */
export async function startProposer(ctx: MutationCtx, workspaceId: Id<"workspaces">, planKey: string): Promise<{ started: boolean; reason?: string }> {
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace || workspace.status !== "active") return { started: false, reason: "not_active" };
  const runs = await recentRuns(ctx, workspaceId);
  if (runs.some((row) => row.inputRef === planKey)) return { started: false, reason: "already_started" };
  if (!planKey.startsWith("week:") && runs.filter((row) => !row.inputRef.startsWith("week:") && row.startedAt > Date.now() - DAY_MS).length >= MAX_CHANGE_RUNS_PER_DAY) return { started: false, reason: "daily_limit" };
  return startAsOwner(ctx, workspaceId, SKILL_SLUG, planKey);
}

/** Something real changed: a report was approved, a check-in came back, results dropped. Proposes on it, once. */
export const changed = internalMutation({
  args: { workspaceId: v.id("workspaces"), key: v.string() },
  handler: async (ctx, args) => startProposer(ctx, args.workspaceId, `change:${args.key}`),
});

const PAGE = 50;

/** The weekly plan: one run per organization per week, where the weekly plan is on. Run every few hours; a week already planned is left alone. */
export const weekly = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const planKey = `week:${weekKey(Date.now())}`;
    const page = await ctx.db.query("workspaces").paginate({ numItems: PAGE, cursor: args.cursor ?? null });
    for (const workspace of page.page) {
      if (workspace.status !== "active" || !(await settingsOf(ctx, workspace._id)).weeklyPlan) continue;
      await startProposer(ctx, workspace._id, planKey);
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.planner.weekly, { cursor: page.continueCursor });
    return null;
  },
});

/**
 * Starts this month's industry trend reading for one organization, unless the switch is off or the month
 * was already read. One run a month, whatever came of it: a month whose run found nothing is not retried.
 */
export async function startTrends(ctx: MutationCtx, workspaceId: Id<"workspaces">): Promise<{ started: boolean; reason?: string }> {
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace || workspace.status !== "active") return { started: false, reason: "not_active" };
  if (!(await settingsOf(ctx, workspaceId)).trendPosts) return { started: false, reason: "switched_off" };
  const key = `month:${monthKey(Date.now())}`;
  if ((await recentRuns(ctx, workspaceId, TRENDS_SKILL)).some((row) => row.inputRef === key)) return { started: false, reason: "already_started" };
  return startAsOwner(ctx, workspaceId, TRENDS_SKILL, key);
}

/** Industry trend posts: one run per organization per month, where they are switched on. Run every few hours; a month already read is left alone. */
export const monthly = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("workspaces").paginate({ numItems: PAGE, cursor: args.cursor ?? null });
    for (const workspace of page.page) await startTrends(ctx, workspace._id);
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.planner.monthly, { cursor: page.continueCursor });
    return null;
  },
});
