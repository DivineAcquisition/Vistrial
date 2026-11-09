/**
 * The home page and the sidebar: what is waiting on a person, where the loop stands (understand, research,
 * decide, try, measure), what Vistrial knows about the business, and the evidence gathered across sessions.
 * Read-only, and every read stays inside the caller's workspace.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { GROWTH_ARCHITECT } from "./catalog";
import { changesBetween, currentFigures } from "./decisions";
import { workspaceQuery } from "./lib/builders";

type Ctx = QueryCtx & { workspaceId: Id<"workspaces"> };

// ------------------------------------------------------------------------------------------- knowledge

export type KnowledgeKey = "profile" | "facts" | "meta" | "results" | "outcome";

/** In the order a business should add them: the first one missing is the suggestion. */
export const KNOWLEDGE: { key: KnowledgeKey; label: string; missing: string; href: string }[] = [
  { key: "profile", label: "Confirmed business profile", missing: "Confirm your business profile", href: "/app/profile" },
  { key: "facts", label: "Business facts", missing: "Add facts about your business", href: "/app/agents/growth-architect/memory" },
  { key: "results", label: "Results file", missing: "Upload a results file", href: "/app/connections/results" },
  { key: "meta", label: "Meta ads connected", missing: "Connect Meta ads", href: "/app/connections/meta" },
  { key: "outcome", label: "A recorded outcome", missing: "Record what happened after a decision", href: "/app" },
];

/** Five things Vistrial can know, each done or not, the percent done, and the most useful one to add next. */
export function knowledgeFrom(done: Record<KnowledgeKey, boolean>) {
  const items = KNOWLEDGE.map((row) => ({ key: row.key, label: row.label, done: done[row.key], href: row.href }));
  const count = items.filter((row) => row.done).length;
  const next = KNOWLEDGE.find((row) => !done[row.key]);
  return {
    items,
    percent: Math.round((count / KNOWLEDGE.length) * 100),
    next: next ? { key: next.key, label: next.missing, href: next.href } : null,
  };
}

async function knowledge(ctx: Ctx) {
  const profile = await ctx.db
    .query("profileVersions")
    .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", "confirmed"))
    .first();
  let facts = false;
  for (const status of ["verified", "unverified"] as const) {
    const rows = await ctx.db
      .query("businessFacts")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", status))
      .take(50);
    if (rows.some((row) => !row.deletedAt)) facts = true;
  }
  const meta = await ctx.db
    .query("metaConnections")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
    .unique();
  const uploads = await ctx.db
    .query("resultUploads")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
    .order("desc")
    .take(20);
  const decisions = await allDecisions(ctx);
  return knowledgeFrom({
    profile: Boolean(profile),
    facts,
    meta: meta?.status === "connected",
    results: uploads.some((row) => row.status === "ready"),
    outcome: decisions.some((row) => Boolean(row.outcome)),
  });
}

// ------------------------------------------------------------------------------------------- waiting

async function allDecisions(ctx: Ctx) {
  return await ctx.db
    .query("decisions")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
    .take(200);
}

/** Runs stopped on a question for a person, as `studio.attention` reads them. */
async function questions(ctx: Ctx) {
  const out: { run: Doc<"agentRuns">; project: Doc<"researchProjects"> }[] = [];
  for (const status of ["waiting", "needsInput"] as const) {
    const runs = await ctx.db
      .query("agentRuns")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", status))
      .take(25);
    for (const run of runs) {
      const projectId = ctx.db.normalizeId("researchProjects", run.inputRef);
      const project = projectId ? await ctx.db.get(projectId) : null;
      if (!run.waitingFor || !project || project.workspaceId !== ctx.workspaceId) continue;
      out.push({ run, project });
    }
  }
  return out;
}

/** Reports waiting for a person: drafts and drafts that need review. */
async function approvals(ctx: Ctx) {
  const rows: Doc<"assets">[] = [];
  for (const status of ["needsReview", "draft"] as const) {
    rows.push(
      ...(await ctx.db
        .query("assets")
        .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", status))
        .order("desc")
        .take(50)),
    );
  }
  return rows;
}

async function agentOf(ctx: Ctx, runId: Id<"agentRuns"> | undefined) {
  if (!runId) return GROWTH_ARCHITECT;
  const run = await ctx.db.get(runId);
  return run && run.workspaceId === ctx.workspaceId ? run.agentSlug : GROWTH_ARCHITECT;
}

async function sourceCount(ctx: Ctx, runId: Id<"agentRuns"> | undefined) {
  if (!runId) return 0;
  const rows = await ctx.db
    .query("sourceRefs")
    .withIndex("by_workspace_run", (q) => q.eq("workspaceId", ctx.workspaceId).eq("runId", runId))
    .take(500);
  return rows.length;
}

// ------------------------------------------------------------------------------------------- queries

/**
 * Everything the sidebar and the loop strip need in one read: the workspace name, what is waiting on a
 * person (and per agent), runs going, the loop counts, and what Vistrial knows.
 */
export const overview = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const workspace = await ctx.db.get(ctx.workspaceId);
    const asked = await questions(ctx);
    const reports = await approvals(ctx);
    const decisions = await allDecisions(ctx);
    const due = decisions.filter((row) => !row.outcome && row.checkInAt <= now);
    const trying = decisions.filter((row) => !row.outcome && row.checkInAt > now);

    const running: Doc<"agentRuns">[] = [];
    for (const status of ["queued", "running"] as const) {
      running.push(
        ...(await ctx.db
          .query("agentRuns")
          .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", status))
          .take(50)),
      );
    }

    const agents: Record<string, { working: number; waiting: number }> = {};
    const bump = (slug: string, key: "working" | "waiting") => {
      agents[slug] ??= { working: 0, waiting: 0 };
      agents[slug][key] += 1;
    };
    for (const run of running) bump(run.agentSlug, "working");
    for (const row of asked) bump(row.run.agentSlug, "waiting");
    for (const asset of reports) bump(await agentOf(ctx, asset.createdByRun), "waiting");
    // Decisions come from Growth Architect reports.
    for (let index = 0; index < due.length; index += 1) bump(GROWTH_ARCHITECT, "waiting");

    const known = await knowledge(ctx);
    return {
      workspaceName: workspace?.name ?? "Your business",
      role: ctx.member.role,
      /** Reps can see what is waiting, but an owner or manager answers and approves. */
      actionable: ctx.member.role !== "rep",
      waiting: {
        total: asked.length + due.length + reports.length,
        questions: asked.length,
        checkIns: due.length,
        approvals: reports.length,
      },
      loop: {
        understand: known.percent,
        research: running.length,
        decide: reports.length,
        try: trying.length,
        measure: due.length,
      },
      knowledge: known,
      agents,
    };
  },
});

/**
 * The one list on the home page, ordered by what unblocks the most work: a question stops a run, a check-in
 * feeds the next research, and an approval releases a report.
 */
export const waiting = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const asked = (await questions(ctx)).sort((a, b) => b.run.waitingFor!.askedAt - a.run.waitingFor!.askedAt);
    const due = (await allDecisions(ctx)).filter((row) => !row.outcome && row.checkInAt <= now).sort((a, b) => a.checkInAt - b.checkInAt);
    const reports = (await approvals(ctx)).sort(
      (a, b) => Number(b.status === "needsReview") - Number(a.status === "needsReview") || b.createdAt - a.createdAt,
    );
    const items = [];
    for (const { run, project } of asked) {
      items.push({
        kind: "question" as const,
        key: `q:${run._id}`,
        agentSlug: run.agentSlug,
        runId: run._id,
        status: run.status as "waiting" | "needsInput",
        question: run.waitingFor!.question,
        at: run.waitingFor!.askedAt,
        projectId: project._id,
        projectTitle: project.title,
      });
    }
    for (const row of due) {
      items.push({
        kind: "checkIn" as const,
        key: `c:${row._id}`,
        agentSlug: GROWTH_ARCHITECT,
        decisionId: row._id,
        proposedAction: row.proposedAction,
        at: row.checkInAt,
        projectId: row.projectId,
      });
    }
    for (const asset of reports) {
      items.push({
        kind: "approval" as const,
        key: `a:${asset._id}`,
        agentSlug: await agentOf(ctx, asset.createdByRun),
        asset: {
          id: asset._id,
          title: asset.title,
          kind: asset.kind,
          status: asset.status,
          currentVersion: asset.currentVersion,
          createdAt: asset.createdAt,
          createdByRun: asset.createdByRun ?? null,
        },
        at: asset.createdAt,
        sources: await sourceCount(ctx, asset.createdByRun),
      });
    }
    return items;
  },
});

/** Outcomes the business recorded, with the measured change from before to after. Newest first. */
export const proven = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const rows = (await allDecisions(ctx)).filter((row) => row.outcome).sort((a, b) => b.outcome!.recordedAt - a.outcome!.recordedAt);
    return rows.slice(0, 10).map((row) => ({
      id: row._id,
      projectId: row.projectId,
      proposedAction: row.proposedAction,
      result: row.outcome!.result,
      note: row.outcome!.note,
      recordedAt: row.outcome!.recordedAt,
      changes: changesBetween(row.baseline, row.outcome!.after),
    }));
  },
});

/**
 * The Evidence page: every source collected across sessions, newest first, and the business's own figures.
 * Figures are money, so reps see the sources only.
 */
export const evidence = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db
      .query("researchProjects")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(30);
    const sources = [];
    for (const project of projects) {
      const refs = await ctx.db
        .query("sourceRefs")
        .withIndex("by_workspace_project", (q) => q.eq("workspaceId", ctx.workspaceId).eq("projectId", project._id))
        .take(100);
      for (const ref of refs) {
        sources.push({
          id: ref._id,
          title: ref.title,
          url: ref.url,
          platform: ref.platform,
          kind: ref.kind,
          publisher: ref.publisher ?? null,
          observedAt: ref.observedAt,
          origin: ref.origin,
          projectId: project._id,
          projectTitle: project.title,
        });
      }
    }
    sources.sort((a, b) => b.observedAt - a.observedAt);
    const seesFigures = ctx.member.role !== "rep";
    return {
      sources: sources.slice(0, 300),
      sourceCount: sources.length,
      sessionCount: projects.length,
      figures: seesFigures ? await currentFigures(ctx, ctx.workspaceId) : [],
      seesFigures,
    };
  },
});

/** Sessions and reports whose title matches, for the sidebar search. */
export const search = workspaceQuery({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const needle = args.text.trim().toLowerCase().slice(0, 100);
    if (needle.length < 2) return [];
    const projects = await ctx.db
      .query("researchProjects")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(200);
    const assets = await ctx.db
      .query("assets")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(200);
    const hits: { kind: "session" | "asset"; id: string; title: string; href: string }[] = [];
    for (const row of projects) {
      if (row.status === "archived") continue;
      if (`${row.title} ${row.objective}`.toLowerCase().includes(needle)) {
        hits.push({ kind: "session", id: row._id, title: row.title, href: `/app/agents/${GROWTH_ARCHITECT}/sessions/${row._id}` });
      }
    }
    for (const row of assets) {
      if (row.status === "archived") continue;
      if (row.title.toLowerCase().includes(needle)) hits.push({ kind: "asset", id: row._id, title: row.title, href: `/app/assets/${row._id}` });
    }
    return hits.slice(0, 20);
  },
});
