/**
 * Development only: run the real research path for a named test workspace from the dashboard, as its owner
 * would in the app (intake chat, then Start). Every function refuses unless dev skills are on, so none of
 * this can run in production.
 */
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";


import { internalMutation, internalQuery } from "./_generated/server";
import { GROWTH_ARCHITECT } from "./catalog";
import { writeAudit } from "./lib/audit";
import { notFound } from "./lib/errors";
import { createWorkspaceFor } from "./lib/newWorkspace";
import { devSkillsEnabled } from "./lib/registry";
import { cleanScope } from "./research";
import { startRunFor } from "./runs";
import { moveFilesToProject } from "./files";

/** Creates (or finds) a test workspace owned by `userId`, set up and with Growth Architect on. */
export const setUpWorkspace = internalMutation({
  args: { userId: v.string(), name: v.string(), displayName: v.string(), timezone: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!devSkillsEnabled()) notFound();
    const member = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("active"), true))
      .first();
    const workspaceId =
      member?.workspaceId ??
      (await createWorkspaceFor(ctx, { userId: args.userId, displayName: args.displayName, name: args.name, timezone: args.timezone }));
    const settings = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .unique();
    if (settings && !settings.setupDone) await ctx.db.patch(settings._id, { setupDone: true });
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_slug", (q) => q.eq("slug", GROWTH_ARCHITECT))
      .unique();
    if (agent) {
      const link = await ctx.db
        .query("workspaceAgents")
        .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", workspaceId).eq("agentId", agent._id))
        .unique();
      if (link && link.state !== "on") await ctx.db.patch(link._id, { state: "on", updatedAt: Date.now(), updatedBy: args.userId });
      if (!link) await ctx.db.insert("workspaceAgents", { workspaceId, agentId: agent._id, state: "on", updatedAt: Date.now(), updatedBy: args.userId });
    }
    await writeAudit(ctx, { workspaceId, actorType: "system", actorId: "dev", action: "dev.workspace_ready", subject: args.userId });
    return workspaceId;
  },
});

/** What Start does in the app: turns a ready intake into a project and a run. Skips the credit check only. */
export const startFromIntake = internalMutation({
  args: { intakeId: v.id("intakes"), userId: v.string(), mode: v.optional(v.union(v.literal("thorough"), v.literal("fast"))) },
  handler: async (ctx, args) => {
    if (!devSkillsEnabled()) notFound();
    const intake = await ctx.db.get(args.intakeId);
    if (!intake || intake.status !== "ready") throw new Error("That conversation has no plan ready yet.");
    const slots = intake.slots;
    const title = slots.market && slots.geography ? `${slots.market}, ${slots.geography}`.slice(0, 80) : slots.objective.slice(0, 80) || "Research session";
    const scope = cleanScope({
      title,
      objective: slots.objective,
      market: slots.market,
      geography: slots.geography,
      competitors: slots.competitors.map((row: { name: string; url?: string }) => (row.url ? { name: row.name, url: row.url } : { name: row.name })),
      platforms: slots.platforms as ("web" | "youtube" | "tiktok" | "instagram" | "metaAdLibrary")[],
      suppliedUrls: slots.links,
    });
    const now = Date.now();
    const projectId = await ctx.db.insert("researchProjects", {
      workspaceId: intake.workspaceId,
      ...scope,
      status: "draft",
      createdBy: args.userId,
      createdAt: now,
      updatedAt: now,
    });
    const runId = await startRunFor(ctx, {
      workspaceId: intake.workspaceId,
      userId: args.userId,
      role: "owner",
      checkCredit: false,
      agentSlug: GROWTH_ARCHITECT,
      skillSlug: "market-intelligence",
      projectId,
      mode: args.mode ?? intake.mode ?? "thorough",
    });
    await ctx.db.patch(intake._id, { status: "started", projectId, updatedAt: now });
    await moveFilesToProject(ctx, intake._id, projectId);
    return { projectId, runId };
  },
});

/** A compact read of a run for watching it from the dashboard. */
export const watch = internalQuery({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    if (!devSkillsEnabled()) notFound();
    const run = await ctx.db.get(args.runId);
    if (!run) notFound();
    const steps = await ctx.db
      .query("runSteps")
      .withIndex("by_workspace_run", (q) => q.eq("workspaceId", run.workspaceId).eq("runId", run._id))
      .collect();
    return {
      status: run.status,
      stopReason: run.stopReason ?? null,
      waitingFor: run.waitingFor ?? null,
      costCents: run.costCents,
      steps: steps.map((row) => ({ index: row.index, kind: row.kind, tool: row.toolSlug ?? null, phase: row.phase ?? null, status: row.status, result: row.resultCode, searches: row.webSearches ?? 0 })),
    };
  },
});


/** The report a run made, with its sources, for reviewing quality from the dashboard. */
export const report = internalQuery({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    if (!devSkillsEnabled()) notFound();
    const run = await ctx.db.get(args.runId);
    if (!run) notFound();
    const asset = await ctx.db
      .query("assets")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", run.workspaceId))
      .filter((q) => q.eq(q.field("createdByRun"), run._id))
      .first();
    const version = asset
      ? await ctx.db
          .query("assetVersions")
          .withIndex("by_workspace_asset", (q) => q.eq("workspaceId", run.workspaceId).eq("assetId", asset._id))
          .order("desc")
          .first()
      : null;
    const projectId = run.inputRef as Id<"researchProjects">;
    const sources = await ctx.db
      .query("sourceRefs")
      .withIndex("by_workspace_project", (q) => q.eq("workspaceId", run.workspaceId).eq("projectId", projectId))
      .take(200);
    return {
      title: asset?.title ?? null,
      status: asset?.status ?? null,
      body: version?.body ?? null,
      sources: sources.map((row) => ({ platform: row.platform, kind: row.kind, title: row.title, url: row.url, availability: row.availability })),
    };
  },
});
