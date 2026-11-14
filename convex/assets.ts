import { requireAdmin, requireWork } from "./lib/roles";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { recordDecision } from "./lib/approvals";
import { writeAudit } from "./lib/audit";
import { askAssetReview, assetApproval } from "./lib/briefing";
import {
  BASIS_LABEL,
  MISSING_SOURCE,
  assertClaims,
  assertSourcesExist,
  claimFromRow,
  claimProblem,
  claimsWithMissingSources,
  sourceRefsInWorkspace,
  type ClaimInput,
} from "./lib/evidence";
import { basis } from "./lib/researchShapes";
import { assetStatus } from "./lib/assetStatus";
import { notFound, userError } from "./lib/errors";
import { markOfAsset } from "./lib/modelMarks";

/** A draft that failed a completion check is fixed by a person first: a new version, or a rejection. */
export const NEEDS_REVIEW = "This draft did not pass its checks. Edit it to add a new version, or reject it.";

const claim = v.object({
  claimKey: v.string(),
  statement: v.string(),
  sourceId: v.optional(v.string()),
  fetchedAt: v.optional(v.number()),
  computed: v.optional(v.boolean()),
  basis: v.optional(basis),
  sourceRefIds: v.optional(v.array(v.id("sourceRefs"))),
});

function assertEditor(role: string) {
  requireWork(role);
}

export const list = workspaceQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(assetStatus),
    kind: v.optional(
      v.union(
        v.literal("researchReport"),
        v.literal("marketReport"),
        v.literal("offerAnalysis"),
        v.literal("adCopySet"),
        v.literal("creativeBrief"),
        v.literal("contentCalendar"),
        v.literal("swipeItem"),
        v.literal("growthDiagnosis"),
        v.literal("pipelineReview"),
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
        : args.kind
          ? await ctx.db
              .query("assets")
              .withIndex("by_workspace_kind", (q) => q.eq("workspaceId", ctx.workspaceId).eq("kind", args.kind!))
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
      evidence.map(async (row) => {
        const refs = await sourceRefsInWorkspace(ctx, workspaceId, row.sourceRefIds ?? []);
        return {
          claimKey: row.claimKey,
          statement: row.statement ?? null,
          computed: row.computed === true,
          fetchedAt: row.fetchedAt ?? null,
          sourceLabel: await sourceLabel(ctx, workspaceId, row.sourceId),
          basis: row.basis ?? null,
          /** From the basis, in code. A claim the model wrote as fact still reads "Inference" if that is its basis. */
          basisLabel: row.basis ? BASIS_LABEL[row.basis] : null,
          sources: refs.map((ref) => ({
            id: ref._id,
            platform: ref.platform,
            title: ref.title,
            url: ref.url,
            publisher: ref.publisher ?? null,
            observedAt: ref.observedAt,
            availability: ref.availability,
          })),
          /** True when the claim cannot stand on what is in the workspace now. The screen blocks approval on it. */
          sourceMissing: (await claimProblem(ctx, workspaceId, claimFromRow(row))) !== null,
        };
      }),
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
      /** The model that made it, as stored on its run. Null for older work. */
      model: await markOfAsset(ctx, asset),
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

type Decider = MutationCtx & { workspaceId: Id<"workspaces">; identity: { subject: string } };

/**
 * Approves a waiting asset. The rule lives here, for every door that approves one (the asset page, the
 * Briefing, the Tasks board): every claim on the version being approved must still point at a real source
 * in this organization, or be marked computed. The caller has already checked the person is an Owner or Admin.
 */
export async function approveAsset(ctx: Decider, asset: Doc<"assets">) {
  if (asset.status === "needsReview") throw userError(NEEDS_REVIEW);
  if (asset.status !== "draft") throw userError("That asset is not waiting.");
  const current = await ctx.db
    .query("assetVersions")
    .withIndex("by_workspace_asset", (q) => q.eq("workspaceId", ctx.workspaceId).eq("assetId", asset._id))
    .filter((q) => q.eq(q.field("version"), asset.currentVersion))
    .first();
  if (!current) throw userError("That version is missing, so it cannot be approved.");
  const claims: ClaimInput[] = [];
  for await (const row of ctx.db
    .query("evidence")
    .withIndex("by_workspace_version", (q) => q.eq("workspaceId", ctx.workspaceId).eq("assetVersionId", current._id))) {
    claims.push(claimFromRow(row));
  }
  if ((await claimsWithMissingSources(ctx, ctx.workspaceId, claims)).length > 0) {
    throw userError(MISSING_SOURCE);
  }
  await ctx.db.patch(asset._id, { status: "approved" });
  await writeAudit(ctx, {
    workspaceId: ctx.workspaceId,
    actorType: "user",
    actorId: ctx.identity.subject,
    action: "asset.approved",
    subject: asset._id,
    count: asset.currentVersion,
  });
  await recordDecision(ctx, { ...(await assetApproval(ctx, asset)), status: "approved", actor: ctx.identity.subject });
  // An approved report is something real that changed: the proposer looks at what it opens up.
  await ctx.scheduler.runAfter(0, internal.planner.changed, { workspaceId: ctx.workspaceId, key: `approved:${asset._id}` });
}

export const approve = workspaceMutation({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    // Approving is the sign-off before something can go public: Owners and Admins.
    requireAdmin(ctx.member.role);
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.workspaceId !== ctx.workspaceId) notFound();
    await approveAsset(ctx, asset);
    return null;
  },
});

export const MAX_REASON = 1000;

async function currentVersion(ctx: QueryCtx, asset: Doc<"assets">) {
  return ctx.db
    .query("assetVersions")
    .withIndex("by_workspace_asset", (q) => q.eq("workspaceId", asset.workspaceId).eq("assetId", asset._id))
    .filter((q) => q.eq(q.field("version"), asset.currentVersion))
    .first();
}

function cleanReason(raw: string) {
  const reason = raw.replace(/\s+/g, " ").trim();
  if (reason.length < 3) throw userError("Say why, in a few words.");
  if (reason.length > MAX_REASON) throw userError(`Keep the reason to ${MAX_REASON} characters.`);
  return reason;
}

/**
 * Rejects a waiting asset with a reason. It leaves the queue and keeps every version. The reason is saved
 * as feedback, which becomes reusable context only if a person promotes it. The caller has checked the role.
 */
export async function rejectAsset(ctx: Decider, asset: Doc<"assets">, rawReason: string) {
  if (asset.status !== "draft" && asset.status !== "needsReview") throw userError("That asset is not waiting.");
  const reason = cleanReason(rawReason);
  const version = await currentVersion(ctx, asset);
  if (!version) throw userError("That version is missing.");
  const feedbackId = await ctx.db.insert("feedback", {
    workspaceId: ctx.workspaceId,
    assetId: asset._id,
    assetVersionId: version._id,
    kind: "rejection",
    reason,
    createdBy: ctx.identity.subject,
    createdAt: Date.now(),
  });
  await ctx.db.patch(asset._id, { status: "rejected" });
  await writeAudit(ctx, {
    workspaceId: ctx.workspaceId,
    actorType: "user",
    actorId: ctx.identity.subject,
    action: "asset.rejected",
    subject: asset._id,
    count: asset.currentVersion,
  });
  await recordDecision(ctx, { ...(await assetApproval(ctx, asset)), status: "declined", actor: ctx.identity.subject });
  return feedbackId;
}

export const reject = workspaceMutation({
  args: { assetId: v.id("assets"), reason: v.string() },
  handler: async (ctx, args) => {
    assertEditor(ctx.member.role);
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.workspaceId !== ctx.workspaceId) notFound();
    return rejectAsset(ctx, asset, args.reason);
  },
});

/** Asks for changes to a waiting asset. It stays in the queue; the reason is saved as feedback. */
export const requestRevision = workspaceMutation({
  args: { assetId: v.id("assets"), reason: v.string() },
  handler: async (ctx, args) => {
    assertEditor(ctx.member.role);
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.workspaceId !== ctx.workspaceId) notFound();
    if (asset.status !== "draft" && asset.status !== "needsReview") throw userError("That asset is not waiting.");
    const reason = cleanReason(args.reason);
    const version = await currentVersion(ctx, asset);
    if (!version) throw userError("That version is missing.");
    const feedbackId = await ctx.db.insert("feedback", {
      workspaceId: ctx.workspaceId,
      assetId: asset._id,
      assetVersionId: version._id,
      kind: "revisionRequest",
      reason,
      createdBy: ctx.identity.subject,
      createdAt: Date.now(),
    });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "asset.revision_requested",
      subject: asset._id,
      count: asset.currentVersion,
    });
    return feedbackId;
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
        basis: item.basis,
        sourceRefIds: item.sourceRefIds,
      });
    }
    // Approval covers one version. New content waits for approval again.
    await ctx.db.patch(asset._id, { currentVersion: version, status: "draft" });
    await askAssetReview(ctx, { ...asset, currentVersion: version, status: "draft" });
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
