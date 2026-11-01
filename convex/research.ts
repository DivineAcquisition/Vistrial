import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { writeAudit } from "./lib/audit";
import { notAllowed, notFound } from "./lib/errors";
import {
  LIMITS,
  RESEARCH_PLATFORMS,
  canonicalUrl,
  optionalText,
  requireText,
  trimExcerpt,
  type ResearchPlatform,
} from "./lib/research";

const researchPlatform = v.union(
  v.literal("web"),
  v.literal("youtube"),
  v.literal("tiktok"),
  v.literal("instagram"),
  v.literal("metaAdLibrary"),
);

const sourcePlatform = v.union(researchPlatform, v.literal("customer"));

const sourceState = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("available"),
  v.literal("partial"),
  v.literal("unavailable"),
  v.literal("awaitingAuthorization"),
);

const scope = {
  title: v.optional(v.string()),
  objective: v.string(),
  market: v.string(),
  geography: v.string(),
  competitors: v.array(v.object({ name: v.string(), url: v.optional(v.string()) })),
  platforms: v.array(researchPlatform),
};

type ScopeInput = {
  title?: string;
  objective: string;
  market: string;
  geography: string;
  competitors: { name: string; url?: string }[];
  platforms: ResearchPlatform[];
};

function cleanScope(args: ScopeInput) {
  const objective = requireText(args.objective, LIMITS.objective, "an objective");
  const market = requireText(args.market, LIMITS.market, "the market");
  const geography = optionalText(args.geography, LIMITS.geography, "the geography");
  if (args.competitors.length > LIMITS.competitors) throw new Error(`Add at most ${LIMITS.competitors} competitors.`);
  const competitors = args.competitors.map((row) => {
    const name = requireText(row.name, LIMITS.competitorName, "each competitor's name");
    if (!row.url?.trim()) return { name };
    const url = canonicalUrl(row.url);
    if (!url) throw new Error(`The link for ${name} is not a web address.`);
    return { name, url };
  });
  const platforms = RESEARCH_PLATFORMS.filter((platform) => args.platforms.includes(platform));
  if (platforms.length === 0) throw new Error("Pick at least one source.");
  const title = optionalText(args.title, LIMITS.title, "the title") || objective.slice(0, 80);
  return { title, objective, market, geography, competitors, platforms };
}

/** A record in this workspace, or the same "Not found." as a missing one. */
async function projectIn(ctx: QueryCtx, workspaceId: Id<"workspaces">, projectId: Id<"researchProjects">) {
  const project = await ctx.db.get(projectId);
  if (!project || project.workspaceId !== workspaceId) notFound();
  return project;
}

function assertEditor(role: string) {
  if (role === "rep") notAllowed();
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
    status: row.status,
    latestRunId: row.latestRunId ?? null,
    profileVersionId: row.profileVersionId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function sourceRefView(row: Doc<"sourceRefs">) {
  return {
    id: row._id,
    projectId: row.projectId ?? null,
    platform: row.platform,
    kind: row.kind,
    url: row.url,
    canonicalUrl: row.canonicalUrl,
    title: row.title ?? null,
    publisher: row.publisher ?? null,
    publishedAt: row.publishedAt ?? null,
    observedAt: row.observedAt,
    embed: row.embed ?? null,
    availability: row.availability,
    availabilityCode: row.availabilityCode ?? null,
    excerpt: row.excerpt ?? null,
    classification: row.classification
      ? {
          hook: row.classification.hook ?? null,
          offer: row.classification.offer ?? null,
          callToAction: row.classification.callToAction ?? null,
          format: row.classification.format ?? null,
          audienceHypothesis: row.classification.audienceHypothesis ?? null,
          relevance: row.classification.relevance ?? null,
          limitations: row.classification.limitations ?? null,
          classifiedBy: row.classification.classifiedBy,
        }
      : null,
    supplied: row.suppliedBy !== undefined,
  };
}

async function statusRows(ctx: QueryCtx, workspaceId: Id<"workspaces">, runId: Id<"agentRuns">) {
  const rows = await ctx.db
    .query("sourceStatus")
    .withIndex("by_workspace_run", (q) => q.eq("workspaceId", workspaceId).eq("runId", runId))
    .take(20);
  return rows.map((row) => ({
    source: row.source,
    status: row.status,
    reasonCode: row.reasonCode,
    found: row.found,
    updatedAt: row.updatedAt,
  }));
}

export const createProject = workspaceMutation({
  args: scope,
  handler: async (ctx, args) => {
    assertEditor(ctx.member.role);
    const clean = cleanScope(args);
    const confirmed = await ctx.db
      .query("profileVersions")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", "confirmed"))
      .order("desc")
      .first();
    const now = Date.now();
    const id = await ctx.db.insert("researchProjects", {
      workspaceId: ctx.workspaceId,
      ...clean,
      status: "draft",
      profileVersionId: confirmed?._id,
      createdBy: ctx.identity.subject,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "research.project_created",
      subject: id,
      count: clean.platforms.length,
    });
    return id;
  },
});

/** Scope changes only while the project is a draft. A project that has run keeps the scope it ran with. */
export const updateProject = workspaceMutation({
  args: { projectId: v.id("researchProjects"), ...scope },
  handler: async (ctx, { projectId, ...rest }) => {
    assertEditor(ctx.member.role);
    const project = await projectIn(ctx, ctx.workspaceId, projectId);
    if (project.status !== "draft") throw new Error("This project has run, so its scope is fixed. Start a new one.");
    await ctx.db.patch(project._id, { ...cleanScope(rest), updatedAt: Date.now() });
    return null;
  },
});

export const archiveProject = workspaceMutation({
  args: { projectId: v.id("researchProjects") },
  handler: async (ctx, args) => {
    assertEditor(ctx.member.role);
    const project = await projectIn(ctx, ctx.workspaceId, args.projectId);
    if (project.status === "running") throw new Error("Stop the run before archiving this project.");
    await ctx.db.patch(project._id, { status: "archived", updatedAt: Date.now() });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "research.project_archived",
      subject: project._id,
      count: 0,
    });
    return null;
  },
});

export const listProjects = workspaceQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(v.union(v.literal("draft"), v.literal("running"), v.literal("ready"), v.literal("archived"))),
  },
  handler: async (ctx, args) => {
    const base = args.status
      ? ctx.db
          .query("researchProjects")
          .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", args.status!))
      : ctx.db.query("researchProjects").withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId));
    const result = await base.order("desc").paginate(args.paginationOpts);
    return { ...result, page: result.page.map(projectView) };
  },
});

export const getProject = workspaceQuery({
  args: { projectId: v.id("researchProjects") },
  handler: async (ctx, args) => {
    const project = await projectIn(ctx, ctx.workspaceId, args.projectId);
    const run = project.latestRunId ? await ctx.db.get(project.latestRunId) : null;
    const latestRun =
      run && run.workspaceId === ctx.workspaceId
        ? { id: run._id, status: run.status, stopReason: run.stopReason ?? null, costCents: run.costCents, startedAt: run.startedAt }
        : null;
    return {
      ...projectView(project),
      latestRun,
      sourceStatus: latestRun ? await statusRows(ctx, ctx.workspaceId, latestRun.id) : [],
    };
  },
});

export const listSourceRefs = workspaceQuery({
  args: {
    projectId: v.id("researchProjects"),
    paginationOpts: paginationOptsValidator,
    platform: v.optional(sourcePlatform),
  },
  handler: async (ctx, args) => {
    const project = await projectIn(ctx, ctx.workspaceId, args.projectId);
    const base = args.platform
      ? ctx.db
          .query("sourceRefs")
          .withIndex("by_workspace_project_platform", (q) =>
            q.eq("workspaceId", ctx.workspaceId).eq("projectId", project._id).eq("platform", args.platform!),
          )
      : ctx.db
          .query("sourceRefs")
          .withIndex("by_workspace_project", (q) => q.eq("workspaceId", ctx.workspaceId).eq("projectId", project._id));
    const result = await base.order("desc").paginate(args.paginationOpts);
    return { ...result, page: result.page.map(sourceRefView) };
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

export const runSourceStatus = workspaceQuery({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.workspaceId !== ctx.workspaceId) notFound();
    return statusRows(ctx, ctx.workspaceId, run._id);
  },
});

/**
 * The run and the project it researches. The project comes from the run's input, never from the caller,
 * and must be in the run's workspace. A run whose input is not a project in its workspace is refused.
 */
async function runAndProject(ctx: MutationCtx, runId: Id<"agentRuns">) {
  const run = await ctx.db.get(runId);
  if (!run) notFound();
  const projectId = ctx.db.normalizeId("researchProjects", run.inputRef);
  const project = projectId ? await ctx.db.get(projectId) : null;
  if (!project || project.workspaceId !== run.workspaceId) notFound();
  return { run, project };
}

const refFields = {
  platform: sourcePlatform,
  kind: v.union(v.literal("page"), v.literal("video"), v.literal("post"), v.literal("ad"), v.literal("dataset")),
  url: v.string(),
  title: v.optional(v.string()),
  publisher: v.optional(v.string()),
  publishedAt: v.optional(v.number()),
  embed: v.optional(
    v.object({
      provider: v.union(v.literal("youtube"), v.literal("tiktok"), v.literal("instagram")),
      id: v.string(),
    }),
  ),
  availability: v.union(v.literal("available"), v.literal("unavailable"), v.literal("unknown")),
  availabilityCode: v.optional(v.string()),
  excerpt: v.optional(v.string()),
  artifactId: v.optional(v.id("runArtifacts")),
};

/**
 * Saves one thing an adapter found, for the run's project. The same page found again keeps its id (so
 * claims that cite it stay linked) and only its last-seen run, time and availability change.
 */
export const recordSourceRef = internalMutation({
  args: { runId: v.id("agentRuns"), ...refFields },
  handler: async (ctx, { runId, ...ref }) => {
    const { run, project } = await runAndProject(ctx, runId);
    // Customer data is uploaded by a person. An adapter can never create firstParty support.
    if (ref.platform === "customer") throw new Error("Customer data is uploaded, not collected.");
    const canonical = canonicalUrl(ref.url);
    if (!canonical) throw new Error("That is not a web address.");
    if (ref.artifactId) {
      const artifact = await ctx.db.get(ref.artifactId);
      if (!artifact || artifact.workspaceId !== run.workspaceId || artifact.runId !== run._id) notFound();
    }
    const fields = {
      ...ref,
      url: ref.url.trim(),
      title: ref.title?.trim().slice(0, 300) || undefined,
      publisher: ref.publisher?.trim().slice(0, 200) || undefined,
      excerpt: trimExcerpt(ref.excerpt),
      runId: run._id,
      observedAt: Date.now(),
    };
    const existing = await ctx.db
      .query("sourceRefs")
      .withIndex("by_workspace_project_url", (q) =>
        q.eq("workspaceId", run.workspaceId).eq("projectId", project._id).eq("canonicalUrl", canonical),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        runId: run._id,
        observedAt: fields.observedAt,
        availability: fields.availability,
        availabilityCode: fields.availabilityCode,
      });
      return { id: existing._id, created: false };
    }
    const id = await ctx.db.insert("sourceRefs", {
      workspaceId: run.workspaceId,
      projectId: project._id,
      firstRunId: run._id,
      canonicalUrl: canonical,
      ...fields,
    });
    return { id, created: true };
  },
});

/** Sets one source's status for a run. One row per run and source; later calls update it. */
export const setSourceStatus = internalMutation({
  args: { runId: v.id("agentRuns"), source: sourcePlatform, status: sourceState, reasonCode: v.string(), found: v.number() },
  handler: async (ctx, args) => {
    const { run, project } = await runAndProject(ctx, args.runId);
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(args.reasonCode)) throw new Error("A reason is a short code.");
    const existing = await ctx.db
      .query("sourceStatus")
      .withIndex("by_workspace_run_source", (q) =>
        q.eq("workspaceId", run.workspaceId).eq("runId", run._id).eq("source", args.source),
      )
      .unique();
    const fields = { status: args.status, reasonCode: args.reasonCode, found: Math.max(0, args.found), updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, fields);
    else
      await ctx.db.insert("sourceStatus", {
        workspaceId: run.workspaceId,
        runId: run._id,
        projectId: project._id,
        source: args.source,
        ...fields,
      });
    return null;
  },
});
