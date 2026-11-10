/**
 * The Creative workspace: what a person can start a creative from, the ask itself, the runs going now and
 * the ad sets waiting for review. Starting goes through the run path's own caps and credit check. Nothing
 * here publishes: a creative is a draft a person approves.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { contentOf as kitContent, ownKit } from "./brandKits";
import { GROWTH_ARCHITECT } from "./catalog";
import { writeAudit } from "./lib/audit";
import { brandGaps } from "./lib/brandKits";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { notAllowed, notFound, userError } from "./lib/errors";
import { savedRecord } from "./lib/savedRecords";
import { startRunFor } from "./runs";
import { DIALS, DIAL_WORDS, PHASE, SKILL_SLUG, type CreativeRecord } from "./skills/creativeProduction/shapes";

const OPEN = ["queued", "running", "waiting", "needsInput"] as const;
const MAX_NOTE = 600;
const MAX_SOURCES = 40;

/** Platforms whose sources are ads or content a creative can be modelled on. Never the business's own results. */
const REFERENCE_PLATFORMS = new Set(["youtube", "tiktok", "instagram", "metaAdLibrary", "web"]);

const STATUS_ORDER: Record<Doc<"assets">["status"], number> = { needsReview: 0, draft: 1, approved: 2, rejected: 3, archived: 4 };

/** Plain words for where a run is, as the Creative tab shows it. */
export const PHASE_WORDS: Record<string, string> = {
  [PHASE.context]: "Reading the brand and the reference",
  [PHASE.write]: "Writing the brief and four variations",
  [PHASE.check]: "Checking the wording and the claims",
  [PHASE.revise]: "Revising",
  [PHASE.recheck]: "Checking the revision",
  [PHASE.save]: "Saving for your review",
};

function sourceView(row: Doc<"sourceRefs">) {
  return {
    id: row._id,
    platform: row.platform,
    kind: row.kind,
    title: row.title,
    publisher: row.publisher ?? null,
    url: row.url,
    hook: row.classification?.hook ?? null,
    format: row.classification?.format ?? null,
    observedAt: row.observedAt,
  };
}

async function referenceSource(ctx: QueryCtx, workspaceId: Id<"workspaces">, sourceRefId: Id<"sourceRefs">) {
  const source = await ctx.db.get(sourceRefId);
  if (!source || source.workspaceId !== workspaceId) notFound();
  if (!REFERENCE_PLATFORMS.has(source.platform)) throw userError("Your own results cannot be a reference ad. Choose an ad or a post from the research board.");
  return source;
}

/**
 * What a creative can start from: the brands, the saved offers, and ads and posts research collected, newest
 * first. `sourceRefId` (from "Make our version" on the board) is included even when it is not among the newest.
 */
export const options = workspaceQuery({
  args: { sourceRefId: v.optional(v.id("sourceRefs")) },
  handler: async (ctx, args) => {
    const kits = [];
    for (const kit of await ctx.db.query("brandKits").withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId)).order("desc").take(100)) {
      if (kit.archived) continue;
      const version = await ctx.db
        .query("brandKitVersions")
        .withIndex("by_workspace_kit", (q) => q.eq("workspaceId", ctx.workspaceId).eq("kitId", kit._id).eq("version", kit.currentVersion))
        .unique();
      if (version) kits.push({ id: kit._id, name: kit.name, kind: kit.kind, gaps: brandGaps(kitContent(version)) });
    }
    kits.sort((a, b) => Number(b.kind === "own") - Number(a.kind === "own"));

    const offers = (await ctx.db.query("offerCards").withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId)).order("desc").take(30))
      .filter((card) => !card.archived)
      .map((card) => ({ id: card._id, name: card.name, version: card.currentVersion }));

    const sources: ReturnType<typeof sourceView>[] = [];
    const projects = await ctx.db.query("researchProjects").withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId)).order("desc").take(8);
    for (const project of projects) {
      if (sources.length >= MAX_SOURCES) break;
      const rows = await ctx.db
        .query("sourceRefs")
        .withIndex("by_workspace_project", (q) => q.eq("workspaceId", ctx.workspaceId).eq("projectId", project._id))
        .order("desc")
        .take(60);
      for (const row of rows) {
        // A reference needs something to model: an ad, a video or a post, not a bare link.
        if (!REFERENCE_PLATFORMS.has(row.platform) || row.availability === "unavailable") continue;
        if (row.platform === "web" && !row.classification?.hook) continue;
        if (sources.length < MAX_SOURCES) sources.push(sourceView(row));
      }
    }
    if (args.sourceRefId && !sources.some((row) => row.id === args.sourceRefId)) {
      const chosen = await ctx.db.get(args.sourceRefId);
      if (chosen && chosen.workspaceId === ctx.workspaceId && REFERENCE_PLATFORMS.has(chosen.platform)) sources.unshift(sourceView(chosen));
    }
    return { kits, offers, sources, dials: DIALS.map((dial) => ({ value: dial, ...DIAL_WORDS[dial] })) };
  },
});

/**
 * "Make our version": starts Creative Production for one brand, from a reference ad on the research board,
 * a saved offer, or both. The reference's structure is modelled at the closeness chosen; its wording, footage,
 * faces, voice, music and logos are never reused. Owners and Managers.
 */
export const start = workspaceMutation({
  args: {
    kitId: v.id("brandKits"),
    sourceRefId: v.optional(v.id("sourceRefs")),
    /** A reference the person added as a link or a file, once its breakdown is ready. */
    referenceId: v.optional(v.id("creativeReferences")),
    offerCardId: v.optional(v.id("offerCards")),
    dial: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    if (!args.sourceRefId && !args.referenceId && !args.offerCardId) throw userError("Choose a reference ad or a saved offer to start from.");
    if (args.sourceRefId && args.referenceId) throw userError("Choose one reference ad.");
    const dial = DIALS.find((row) => row === (args.dial ?? "structure"));
    if (!dial) throw userError("Choose how closely to follow the reference.");
    const note = (args.note ?? "").replace(/\s+/g, " ").trim();
    if (note.length > MAX_NOTE) throw userError(`Keep the note under ${MAX_NOTE} characters.`);
    const kit = await ownKit(ctx, ctx.workspaceId, args.kitId);
    if (kit.archived) throw userError("This brand was put away. Choose another, or add it again.");
    if (args.sourceRefId) await referenceSource(ctx, ctx.workspaceId, args.sourceRefId);
    if (args.referenceId) {
      const added = await ctx.db.get(args.referenceId);
      if (!added || added.workspaceId !== ctx.workspaceId) notFound();
      if (added.status === "analysing") throw userError("This reference is still being read. Give it a moment.");
      if (added.status !== "ready" || !added.breakdown) throw userError("This reference could not be read, so there is nothing to model. Add it again or choose another.");
    }
    let offerVersion: number | undefined;
    if (args.offerCardId) {
      const card = await ctx.db.get(args.offerCardId);
      if (!card || card.workspaceId !== ctx.workspaceId) notFound();
      if (card.archived) throw userError("This offer was put away.");
      offerVersion = card.currentVersion;
    }
    const requestId = await ctx.db.insert("creativeRequests", {
      workspaceId: ctx.workspaceId,
      kitId: kit._id,
      kitVersion: kit.currentVersion,
      ...(args.sourceRefId ? { sourceRefId: args.sourceRefId } : {}),
      ...(args.referenceId ? { referenceId: args.referenceId } : {}),
      ...(args.offerCardId ? { offerCardId: args.offerCardId, offerVersion } : {}),
      dial,
      ...(note ? { note } : {}),
      createdBy: ctx.identity.subject,
      createdAt: Date.now(),
    });
    const runId = await startRunFor(ctx, { workspaceId: ctx.workspaceId, userId: ctx.identity.subject, role: ctx.member.role, agentSlug: GROWTH_ARCHITECT, skillSlug: SKILL_SLUG, inputRef: requestId });
    await ctx.db.patch(requestId, { runId });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "creative.started", subject: requestId });
    return { requestId, runId };
  },
});

/** The Creative tab: runs going now with where each is, runs that stopped without a result, and the ad sets, those waiting for review first. */
export const tab = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const running = [];
    for (const status of OPEN) {
      const rows = await ctx.db
        .query("agentRuns")
        .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", status))
        .order("desc")
        .take(20);
      for (const run of rows) {
        if (run.skillSlug !== SKILL_SLUG) continue;
        const steps = await ctx.db
          .query("runSteps")
          .withIndex("by_workspace_run", (q) => q.eq("workspaceId", ctx.workspaceId).eq("runId", run._id))
          .take(60);
        const last = steps.sort((a, b) => a.index - b.index)[steps.length - 1];
        running.push({ id: run._id, startedAt: run.startedAt, costCents: run.costCents, stepsDone: steps.filter((row) => row.status === "completed").length, words: (last?.phase && PHASE_WORDS[last.phase]) || "Getting started" });
      }
    }
    running.sort((a, b) => b.startedAt - a.startedAt);

    const assets = await ctx.db
      .query("assets")
      .withIndex("by_workspace_kind", (q) => q.eq("workspaceId", ctx.workspaceId).eq("kind", "adCopySet"))
      .order("desc")
      .take(40);
    const results = [];
    const withResult = new Set<string>();
    for (const asset of assets) {
      if (asset.createdByRun) withResult.add(asset.createdByRun);
      if (asset.status === "archived") continue;
      const saved = (await savedRecord(ctx.db, asset, "creative")) as CreativeRecord | null;
      if (!saved) continue;
      results.push({ id: asset._id, title: asset.title, status: asset.status, createdAt: asset.createdAt, brand: saved.kit.name, reference: saved.reference?.title ?? null, offer: saved.offer?.name ?? null });
    }
    results.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.createdAt - a.createdAt);

    // Runs that ended with nothing to review, so a person is told why instead of seeing nothing.
    const stopped = (
      await ctx.db
        .query("agentRuns")
        .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", ctx.workspaceId).eq("agentSlug", GROWTH_ARCHITECT))
        .order("desc")
        .take(60)
    )
      .filter((run) => run.skillSlug === SKILL_SLUG && !(OPEN as readonly string[]).includes(run.status) && !withResult.has(run._id))
      .slice(0, 3)
      .map((run) => ({ id: run._id, status: run.status, stopReason: run.stopReason ?? null, startedAt: run.startedAt }));
    return { running, results, stopped };
  },
});

/** One ad set as the Creative tab draws it: the brief, the four variations, the script, the captions, the checks and what it was made from. */
export const view = workspaceQuery({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.workspaceId !== ctx.workspaceId) notFound();
    if (asset.kind !== "adCopySet") return null;
    const saved = (await savedRecord(ctx.db, asset, "creative")) as CreativeRecord | null;
    if (!saved) return null;
    return {
      assetId: asset._id,
      title: asset.title,
      status: asset.status,
      createdAt: asset.createdAt,
      versions: saved.versions,
      dial: { value: saved.dial, ...DIAL_WORDS[saved.dial] },
      kit: saved.kit,
      reference: saved.reference,
      offer: saved.offer,
      disclaimers: saved.disclaimers,
      creative: saved.creative,
      checks: saved.checks,
    };
  },
});
