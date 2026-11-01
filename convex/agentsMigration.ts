import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { RENAMED_AGENTS } from "./catalog";
import { ensureAgents } from "./lib/agents";

/**
 * Moves everything that names a renamed agent (`sales` became `growth-architect`) to the new slug:
 * runs, caps and day counters. Run once per deployment after this code is deployed:
 *
 *   npx convex run agentsMigration:backfill
 *
 * It renames the agent row first (through the catalog sync), then walks workspaces a page at a
 * time and schedules itself until every workspace is done. Running it again changes nothing.
 * Check it with `agentsMigration:remaining`, which must report zero before the old fields are dropped.
 */

const WORKSPACES_PER_BATCH = 20;
const ROWS_PER_WORKSPACE = 200;

async function moveRuns(ctx: MutationCtx, workspaceId: Id<"workspaces">, from: string, to: string) {
  const rows = await ctx.db
    .query("agentRuns")
    .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", workspaceId).eq("agentSlug", from))
    .take(ROWS_PER_WORKSPACE);
  for (const row of rows) await ctx.db.patch(row._id, { agentSlug: to });
  return rows.length === ROWS_PER_WORKSPACE;
}

/** A workspace that set caps for the new slug keeps them. Otherwise the old caps move over. */
async function moveCaps(ctx: MutationCtx, workspaceId: Id<"workspaces">, from: string, to: string) {
  const old = await ctx.db
    .query("agentCaps")
    .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", workspaceId).eq("agentSlug", from))
    .unique();
  if (!old) return;
  const current = await ctx.db
    .query("agentCaps")
    .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", workspaceId).eq("agentSlug", to))
    .unique();
  if (current) await ctx.db.delete(old._id);
  else await ctx.db.patch(old._id, { agentSlug: to });
}

/** Day counters for the same day add up, so no spend is lost and the day cap still holds. */
async function moveCounters(ctx: MutationCtx, workspaceId: Id<"workspaces">, from: string, to: string) {
  const rows = await ctx.db
    .query("capCounters")
    .withIndex("by_workspace_agent_day", (q) => q.eq("workspaceId", workspaceId).eq("agentSlug", from))
    .take(ROWS_PER_WORKSPACE);
  for (const row of rows) {
    const current = await ctx.db
      .query("capCounters")
      .withIndex("by_workspace_agent_day", (q) => q.eq("workspaceId", workspaceId).eq("agentSlug", to).eq("day", row.day))
      .unique();
    if (current) {
      await ctx.db.patch(current._id, { costCents: current.costCents + row.costCents });
      await ctx.db.delete(row._id);
    } else {
      await ctx.db.patch(row._id, { agentSlug: to });
    }
  }
  return rows.length === ROWS_PER_WORKSPACE;
}

export const backfill = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    if (!args.cursor) await ensureAgents(ctx);
    const page = await ctx.db.query("workspaces").paginate({ numItems: WORKSPACES_PER_BATCH, cursor: args.cursor ?? null });
    let more = false;
    for (const workspace of page.page) {
      for (const [from, to] of Object.entries(RENAMED_AGENTS)) {
        if (await moveRuns(ctx, workspace._id, from, to)) more = true;
        await moveCaps(ctx, workspace._id, from, to);
        if (await moveCounters(ctx, workspace._id, from, to)) more = true;
      }
    }
    // A workspace with more rows than one batch holds is visited again from the same cursor.
    const next = more ? (args.cursor ?? null) : page.isDone ? undefined : page.continueCursor;
    if (next !== undefined) await ctx.scheduler.runAfter(0, internal.agentsMigration.backfill, { cursor: next });
    return { workspaces: page.page.length, done: next === undefined };
  },
});

/**
 * Starts the backfill only when something still needs it. A cron (convex/crons.ts) calls this every
 * few minutes on every deployment, so production finishes the migration without anyone running it.
 * Once nothing names an old slug it does no writes and schedules nothing.
 */
export const backfillIfNeeded = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!(await needsBackfill(ctx))) return false;
    await ctx.scheduler.runAfter(0, internal.agentsMigration.backfill, {});
    return true;
  },
});

async function needsBackfill(ctx: MutationCtx) {
  const oldSlugs = Object.keys(RENAMED_AGENTS);
  for (const slug of oldSlugs) {
    if (await ctx.db.query("agents").withIndex("by_slug", (q) => q.eq("slug", slug)).first()) return true;
  }
  for await (const agent of ctx.db.query("agents")) {
    if (agent.area !== undefined || agent.stage !== undefined) return true;
  }
  for await (const workspace of ctx.db.query("workspaces")) {
    for (const slug of oldSlugs) {
      const byWorkspaceAgent = (table: "agentRuns" | "agentCaps") =>
        ctx.db
          .query(table)
          .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", workspace._id).eq("agentSlug", slug))
          .first();
      if (await byWorkspaceAgent("agentRuns")) return true;
      if (await byWorkspaceAgent("agentCaps")) return true;
      const counter = await ctx.db
        .query("capCounters")
        .withIndex("by_workspace_agent_day", (q) => q.eq("workspaceId", workspace._id).eq("agentSlug", slug))
        .first();
      if (counter) return true;
    }
  }
  return false;
}

/** Rows still naming an old agent slug. Zero everywhere means the migration finished. */
export const remaining = internalQuery({
  args: {},
  handler: async (ctx) => {
    const oldSlugs = Object.keys(RENAMED_AGENTS);
    let runs = 0;
    let caps = 0;
    let counters = 0;
    for await (const workspace of ctx.db.query("workspaces")) {
      for (const slug of oldSlugs) {
        runs += (
          await ctx.db
            .query("agentRuns")
            .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", workspace._id).eq("agentSlug", slug))
            .take(1000)
        ).length;
        caps += (
          await ctx.db
            .query("agentCaps")
            .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", workspace._id).eq("agentSlug", slug))
            .take(10)
        ).length;
        counters += (
          await ctx.db
            .query("capCounters")
            .withIndex("by_workspace_agent_day", (q) => q.eq("workspaceId", workspace._id).eq("agentSlug", slug))
            .take(1000)
        ).length;
      }
    }
    let agents = 0;
    for (const slug of oldSlugs) {
      agents += (await ctx.db.query("agents").withIndex("by_slug", (q) => q.eq("slug", slug)).take(5)).length;
    }
    let oldShape = 0;
    for await (const agent of ctx.db.query("agents")) if (agent.area !== undefined || agent.stage !== undefined) oldShape += 1;
    return { agents, runs, caps, counters, oldShapeAgents: oldShape };
  },
});
