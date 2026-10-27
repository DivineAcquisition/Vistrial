import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { writeAudit } from "./lib/audit";
import { assertClaims, assertSourcesExist, type ClaimInput } from "./lib/evidence";
import { notAllowed, notFound } from "./lib/errors";

const claim = v.object({
  claimKey: v.string(),
  statement: v.string(),
  sourceId: v.optional(v.string()),
  fetchedAt: v.optional(v.number()),
  computed: v.optional(v.boolean()),
});

function assertEditor(role: string) {
  if (role === "rep") notAllowed();
}

export const list = workspaceQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(v.union(v.literal("draft"), v.literal("approved"), v.literal("archived"))),
    kind: v.optional(
      v.union(
        v.literal("researchReport"),
        v.literal("adCopySet"),
        v.literal("creativeBrief"),
        v.literal("contentCalendar"),
        v.literal("swipeItem"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const page =
      args.kind && args.status
        ? await ctx.db
            .query("assets")
            .withIndex("by_workspace_kind_status", (q) =>
              q.eq("workspaceId", ctx.workspaceId).eq("kind", args.kind!).eq("status", args.status!),
            )
            .order("desc")
            .paginate(args.paginationOpts)
        : args.status
          ? await ctx.db
              .query("assets")
              .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", args.status!))
              .order("desc")
              .paginate(args.paginationOpts)
          : await ctx.db
              .query("assets")
              .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
              .order("desc")
              .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((row) => ({
        id: row._id,
        kind: row.kind,
        title: row.title,
        status: row.status,
        currentVersion: row.currentVersion,
        createdAt: row.createdAt,
        createdByRun: row.createdByRun ?? null,
      })),
    };
  },
});

/** Names a cited source in plain words. Ids of records outside the workspace read as missing. */
async function sourceLabel(ctx: QueryCtx, workspaceId: Id<"workspaces">, sourceId: string | undefined) {
  if (!sourceId) return null;
  const profileId = ctx.db.normalizeId("profileVersions", sourceId);
  if (profileId) {
    const row = await ctx.db.get(profileId);
    return row && row.workspaceId === workspaceId ? `Business profile, version ${row.version}` : null;
  }
  const exampleId = ctx.db.normalizeId("profileExamples", sourceId);
  if (exampleId) {
    const row = await ctx.db.get(exampleId);
    return row && row.workspaceId === workspaceId ? "Profile example" : null;
  }
  const artifactId = ctx.db.normalizeId("runArtifacts", sourceId);
  if (artifactId) {
    const row = await ctx.db.get(artifactId);
    return row && row.workspaceId === workspaceId ? "Saved run record" : null;
  }
  return null;
}

async function versionView(ctx: QueryCtx, workspaceId: Id<"workspaces">, version: Doc<"assetVersions">) {
  const evidence = await ctx.db
    .query("evidence")
    .withIndex("by_workspace_version", (q) => q.eq("workspaceId", workspaceId).eq("assetVersionId", version._id))
    .take(100);
  return {
    version: version.version,
    createdBy: version.createdBy,
    createdAt: version._creationTime,
    notes: version.notes ?? null,
    body: version.body ?? "",
    evidence: await Promise.all(
      evidence.map(async (row) => ({
        claimKey: row.claimKey,
        statement: row.statement ?? null,
        computed: row.computed === true,
        fetchedAt: row.fetchedAt ?? null,
        sourceLabel: await sourceLabel(ctx, workspaceId, row.sourceId),
      })),
    ),
  };
}

export const get = workspaceQuery({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.workspaceId !== ctx.workspaceId) notFound();
    const versions = await ctx.db
      .query("assetVersions")
      .withIndex("by_workspace_asset", (q) => q.eq("workspaceId", ctx.workspaceId).eq("assetId", asset._id))
      .order("desc")
      .take(20);
    const current = versions.find((row) => row.version === asset.currentVersion) ?? null;
    const view = current ? await versionView(ctx, ctx.workspaceId, current) : null;
    return {
      id: asset._id,
      kind: asset.kind,
      title: asset.title,
      status: asset.status,
      currentVersion: asset.currentVersion,
      createdAt: asset.createdAt,
      createdByRun: asset.createdByRun ?? null,
      body: view?.body ?? "",
      evidence: view?.evidence ?? [],
      versions: versions
        .sort((a, b) => a.version - b.version)
        .map((row) => ({ version: row.version, createdBy: row.createdBy, createdAt: row._creationTime })),
    };
  },
});

/** One version of an asset, for reading an older one or comparing two. */
export const version = workspaceQuery({
  args: { assetId: v.id("assets"), version: v.number() },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.workspaceId !== ctx.workspaceId) notFound();
    const rows = await ctx.db
      .query("assetVersions")
      .withIndex("by_workspace_asset", (q) => q.eq("workspaceId", ctx.workspaceId).eq("assetId", asset._id))
      .filter((q) => q.eq(q.field("version"), args.version))
      .take(1);
    const row = rows[0];
    if (!row) notFound();
    return versionView(ctx, ctx.workspaceId, row);
  },
});

export const approve = workspaceMutation({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    assertEditor(ctx.member.role);
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.workspaceId !== ctx.workspaceId) notFound();
    if (asset.status !== "draft") throw new Error("That asset is not waiting.");
    await ctx.db.patch(asset._id, { status: "approved" });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "asset.approved",
      subject: asset._id,
      count: asset.currentVersion,
    });
    return null;
  },
});

export const addVersion = workspaceMutation({
  args: {
    assetId: v.id("assets"),
    body: v.string(),
    claims: v.array(claim),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertEditor(ctx.member.role);
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.workspaceId !== ctx.workspaceId) notFound();
    assertClaims(args.claims as ClaimInput[]);
    await assertSourcesExist(ctx, ctx.workspaceId, args.claims as ClaimInput[]);
    const version = asset.currentVersion + 1;
    const versionId = await ctx.db.insert("assetVersions", {
      workspaceId: ctx.workspaceId,
      assetId: asset._id,
      version,
      body: args.body,
      createdBy: "person",
      notes: args.notes,
    });
    for (const item of args.claims) {
      await ctx.db.insert("evidence", {
        workspaceId: ctx.workspaceId,
        assetVersionId: versionId,
        claimKey: item.claimKey,
        statement: item.statement,
        sourceId: item.sourceId,
        fetchedAt: item.fetchedAt,
        computed: item.computed,
      });
    }
    // Approval covers one version. New content waits for approval again.
    await ctx.db.patch(asset._id, { currentVersion: version, status: "draft" });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "asset.version_added",
      subject: versionId,
      count: version,
    });
    return version;
  },
});
