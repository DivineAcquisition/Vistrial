import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { writeAudit } from "./lib/audit";
import { notAllowed, notFound } from "./lib/errors";
import { platform, projectStatus, type Platform } from "./lib/researchShapes";
import { canonicalUrl, parsePublicUrl, sourceRefView } from "./lib/sourceRefs";

const LIMITS = { title: 120, objective: 2000, scopeText: 200, competitors: 20, suppliedUrls: 50, platforms: 6 };

const scopeArgs = {
  title: v.string(),
  objective: v.string(),
  market: v.string(),
  geography: v.string(),
  competitors: v.array(v.object({ name: v.string(), url: v.optional(v.string()) })),
  platforms: v.array(platform),
  suppliedUrls: v.array(v.string()),
};

type ScopeInput = {
  title: string;
  objective: string;
  market: string;
  geography: string;
  competitors: { name: string; url?: string }[];
  platforms: Platform[];
  suppliedUrls: string[];
};

/** Checks and tidies what a person typed. Refuses with plain words, never guesses. */
function cleanScope(input: ScopeInput) {
  const title = input.title.trim();
  const objective = input.objective.trim();
  if (title.length === 0 || title.length > LIMITS.title) throw new Error(`Give the project a name of up to ${LIMITS.title} characters.`);
  if (objective.length === 0 || objective.length > LIMITS.objective) {
    throw new Error(`Describe what you want to find out in up to ${LIMITS.objective} characters.`);
  }
  const market = input.market.trim();
  const geography = input.geography.trim();
  if (market.length > LIMITS.scopeText || geography.length > LIMITS.scopeText) throw new Error("Market and geography are too long.");
  if (input.competitors.length > LIMITS.competitors) throw new Error(`List up to ${LIMITS.competitors} competitors.`);
  const competitors = input.competitors.map((row) => {
    const name = row.name.trim();
    if (name.length === 0 || name.length > LIMITS.title) throw new Error("Each competitor needs a name.");
    const url = row.url?.trim();
    if (url && !parsePublicUrl(url)) throw new Error(`The link for ${name} is not a public web address.`);
    return url ? { name, url } : { name };
  });
  const platforms = [...new Set(input.platforms)];
  if (platforms.length === 0) throw new Error("Pick at least one place to look.");
  if (input.suppliedUrls.length > LIMITS.suppliedUrls) throw new Error(`Paste up to ${LIMITS.suppliedUrls} links.`);
  const seen = new Set<string>();
  const suppliedUrls: string[] = [];
  for (const raw of input.suppliedUrls) {
    const canonical = canonicalUrl(raw);
    if (!canonical) throw new Error("One of the links is not a public web address.");
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    suppliedUrls.push(raw.trim());
  }
  return { title, objective, market, geography, competitors, platforms, suppliedUrls };
}

async function ownProject(ctx: QueryCtx, workspaceId: Id<"workspaces">, projectId: Id<"researchProjects">) {
  const project = await ctx.db.get(projectId);
  if (!project || project.workspaceId !== workspaceId) notFound();
  return project;
}

function projectView(row: Doc<"researchProjects">) {
  return {
    id: row._id,
    title: row.title,
    objective: row.objective,
    market: row.market,
    geography: row.geography,
    competitors: row.competitors,
    platforms: row.platforms,
    suppliedUrls: row.suppliedUrls,
    status: row.status,
    latestRunId: row.latestRunId ?? null,
    profileVersionId: row.profileVersionId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Owner or Manager. Scoped against the latest confirmed profile, when there is one. */
export const createProject = workspaceMutation({
  args: scopeArgs,
  handler: async (ctx, input) => {
    if (ctx.member.role === "rep") notAllowed();
    const scope = cleanScope(input);
    const profile = await ctx.db
      .query("profileVersions")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", "confirmed"))
      .order("desc")
      .first();
    const now = Date.now();
    const id = await ctx.db.insert("researchProjects", {
      workspaceId: ctx.workspaceId,
      ...scope,
      status: "draft",
      profileVersionId: profile?._id,
      createdBy: ctx.identity.subject,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "research.created",
      subject: id,
      count: scope.suppliedUrls.length,
    });
    return id;
  },
});

/** The scope can change only while the project is a draft. */
export const updateProject = workspaceMutation({
  args: { projectId: v.id("researchProjects"), ...scopeArgs },
  handler: async (ctx, { projectId, ...input }) => {
    if (ctx.member.role === "rep") notAllowed();
    const project = await ownProject(ctx, ctx.workspaceId, projectId);
    if (project.status !== "draft") throw new Error("This project has already run. Start a new one to change its scope.");
    await ctx.db.patch(project._id, { ...cleanScope(input), updatedAt: Date.now() });
    return null;
  },
});

export const archiveProject = workspaceMutation({
  args: { projectId: v.id("researchProjects") },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const project = await ownProject(ctx, ctx.workspaceId, args.projectId);
    const latest = project.latestRunId ? await ctx.db.get(project.latestRunId) : null;
    if (project.status === "running" || (latest && ["queued", "running", "waiting"].includes(latest.status))) {
      throw new Error("Stop the run before archiving this project.");
    }
    await ctx.db.patch(project._id, { status: "archived", updatedAt: Date.now() });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "research.archived",
      subject: project._id,
    });
    return null;
  },
});

/** Newest first. Every member can read research. */
export const listProjects = workspaceQuery({
  args: { paginationOpts: paginationOptsValidator, status: v.optional(projectStatus) },
  handler: async (ctx, args) => {
    const base = args.status
      ? ctx.db
          .query("researchProjects")
          .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", args.status!))
      : ctx.db.query("researchProjects").withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId));
    const page = await base.order("desc").paginate(args.paginationOpts);
    return { ...page, page: page.page.map(projectView) };
  },
});

/** One project with how many sources it holds per platform, and the latest run's source status. */
export const getProject = workspaceQuery({
  args: { projectId: v.id("researchProjects") },
  handler: async (ctx, args) => {
    const project = await ownProject(ctx, ctx.workspaceId, args.projectId);
    const counts: Partial<Record<Platform, number>> = {};
    for (const name of project.platforms) {
      counts[name] = (
        await ctx.db
          .query("sourceRefs")
          .withIndex("by_workspace_project_platform", (q) =>
            q.eq("workspaceId", ctx.workspaceId).eq("projectId", project._id).eq("platform", name),
          )
          .take(1000)
      ).length;
    }
    const statuses = project.latestRunId ? await statusesFor(ctx, ctx.workspaceId, project.latestRunId) : [];
    return { ...projectView(project), sourceCounts: counts, sourceStatus: statuses };
  },
});

async function statusesFor(ctx: QueryCtx, workspaceId: Id<"workspaces">, runId: Id<"agentRuns">) {
  const rows = await ctx.db
    .query("sourceStatus")
    .withIndex("by_workspace_run", (q) => q.eq("workspaceId", workspaceId).eq("runId", runId))
    .take(20);
  return rows.map((row) => ({
    platform: row.platform,
    state: row.state,
    reasonCode: row.reasonCode,
    found: row.found,
    checkedAt: row.checkedAt,
  }));
}

/** Each source's status for one run of a project. The run must belong to this workspace. */
export const sourceStatuses = workspaceQuery({
  args: { projectId: v.id("researchProjects"), runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    await ownProject(ctx, ctx.workspaceId, args.projectId);
    const run = await ctx.db.get(args.runId);
    if (!run || run.workspaceId !== ctx.workspaceId) notFound();
    return statusesFor(ctx, ctx.workspaceId, run._id);
  },
});

/** A project's sources, a page at a time, optionally for one platform. */
export const listSourceRefs = workspaceQuery({
  args: { projectId: v.id("researchProjects"), platform: v.optional(platform), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const project = await ownProject(ctx, ctx.workspaceId, args.projectId);
    const base = args.platform
      ? ctx.db
          .query("sourceRefs")
          .withIndex("by_workspace_project_platform", (q) =>
            q.eq("workspaceId", ctx.workspaceId).eq("projectId", project._id).eq("platform", args.platform!),
          )
      : ctx.db
          .query("sourceRefs")
          .withIndex("by_workspace_project", (q) => q.eq("workspaceId", ctx.workspaceId).eq("projectId", project._id));
    const page = await base.order("desc").paginate(args.paginationOpts);
    return { ...page, page: page.page.map(sourceRefView) };
  },
});

export const getSourceRef = workspaceQuery({
  args: { sourceRefId: v.id("sourceRefs") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.sourceRefId);
    if (!row || row.workspaceId !== ctx.workspaceId) notFound();
    return sourceRefView(row);
  },
});
