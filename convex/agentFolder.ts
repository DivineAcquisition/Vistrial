/**
 * What the folder sidebar shows for one agent: its sessions with a live state, how many facts, reports and
 * open runs it has, and the connections it may use. Read-only, scoped to the caller's workspace.
 */

import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { GROWTH_ARCHITECT } from "./catalog";
import { workspaceQuery } from "./lib/builders";
import { grantedAgents } from "./metaAds";

const SESSIONS_SHOWN = 8;

export type SessionState = "draft" | "working" | "waiting" | "review" | "done" | "stopped";

function sessionState(run: Doc<"agentRuns"> | null, asset: Doc<"assets"> | null): SessionState {
  if (!run) return "draft";
  if (run.status === "queued" || run.status === "running") return "working";
  if (run.status === "waiting" || run.status === "needsInput") return "waiting";
  if (run.status === "failed" || run.status === "stopped") return "stopped";
  if (asset && (asset.status === "needsReview" || asset.status === "draft")) return "review";
  return "done";
}

export const tree = workspaceQuery({
  args: { agentSlug: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const shown = Math.max(1, Math.min(40, args.limit ?? SESSIONS_SHOWN));
    // Research sessions belong to the Growth Architect, the only agent with a project-based skill today.
    const ownsSessions = args.agentSlug === GROWTH_ARCHITECT;

    const projects = ownsSessions
      ? (
          await ctx.db
            .query("researchProjects")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
            .order("desc")
            .take(40)
        ).filter((row) => row.status !== "archived")
      : [];
    const sessions = [];
    for (const project of projects.slice(0, shown)) {
      const run = project.latestRunId ? await ctx.db.get(project.latestRunId) : null;
      const asset = run
        ? await ctx.db
            .query("assets")
            .withIndex("by_workspace_run", (q) => q.eq("workspaceId", ctx.workspaceId).eq("createdByRun", run._id))
            .first()
        : null;
      sessions.push({
        id: project._id,
        title: project.title,
        objective: project.objective,
        geography: project.geography,
        state: sessionState(run, asset),
        updatedAt: project.updatedAt,
        costCents: run?.costCents ?? 0,
      });
    }

    const facts = ownsSessions
      ? (
          await ctx.db
            .query("businessFacts")
            .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId))
            .take(300)
        ).filter((row) => row.status !== "superseded" && !row.deletedAt).length
      : 0;
    const reports = ownsSessions
      ? (
          await ctx.db
            .query("assets")
            .withIndex("by_workspace_kind", (q) => q.eq("workspaceId", ctx.workspaceId).eq("kind", "marketReport"))
            .take(200)
        ).filter((row) => row.status !== "archived")
      : [];
    const runs = await ctx.db
      .query("agentRuns")
      .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", ctx.workspaceId).eq("agentSlug", args.agentSlug))
      .order("desc")
      .take(50);

    const meta = await ctx.db
      .query("metaConnections")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .unique();
    const metaGranted = meta ? grantedAgents(meta).includes(args.agentSlug) : false;

    return {
      sessions,
      sessionCount: projects.length,
      counts: {
        facts,
        reports: reports.length,
        reportsWaiting: reports.filter((row) => row.status === "needsReview").length,
        runsOpen: runs.filter((row) => row.status === "queued" || row.status === "running" || row.status === "waiting").length,
      },
      connections: [
        {
          key: "meta",
          label: "Meta ads",
          state: !meta ? ("off" as const) : !metaGranted ? ("notGranted" as const) : meta.status === "needsReconnect" ? ("attention" as const) : ("on" as const),
          detail: meta?.adAccountName ?? null,
        },
        // Research sources: on when the deployment holds what they need. Names only; no key leaves the server.
        { key: "youtube", label: "YouTube", state: process.env.YOUTUBE_API_KEY ? ("on" as const) : ("off" as const), detail: null },
        { key: "instagram", label: "Instagram", state: process.env.META_APP_ID ? ("attention" as const) : ("off" as const), detail: "Waiting for Meta approval" },
        { key: "adLibrary", label: "Meta Ad Library", state: process.env.META_AD_LIBRARY_TOKEN ? ("attention" as const) : ("off" as const), detail: "EU and UK ads only" },
      ],
    };
  },
});
