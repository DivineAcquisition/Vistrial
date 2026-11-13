/**
 * The Creative workspace: what a person can start a creative from, the ask itself, the runs going now and
 * the ad sets waiting for review. Starting goes through the run path's own caps and credit check. Nothing
 * here publishes: a creative is a draft a person approves.
 */

import { requireWork } from "./lib/roles";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { runChecks } from "./skills/creativeProduction/checks";
import { renderCreative } from "./skills/creativeProduction/render";
import { creativeClaims, writeVersion } from "./skills/creativeProduction/tools";
import { contentOf as kitContent, ownKit } from "./brandKits";
import { GROWTH_ARCHITECT } from "./catalog";
import { testFor, testStates } from "./creativeTests";
import { writeAudit } from "./lib/audit";
import { brandGaps } from "./lib/brandKits";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { notFound, userError } from "./lib/errors";
import { savedRecord } from "./lib/savedRecords";
import { startRunFor } from "./runs";
import { COPY_MAX, DIALS, DIAL_WORDS, PHASE, SKILL_SLUG, designText, type CreativeContext, type CreativeRecord, type Variation } from "./skills/creativeProduction/shapes";
import { markOfAsset } from "./lib/modelMarks";

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
 * faces, voice, music and logos are never reused. Owners, Admins and Members.
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
    /** The model family picked for this work: claude, gpt or gemini. Missing means the organization's default. */
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
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
      ...(kit.clientId ? { clientId: kit.clientId } : {}),
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
    const runId = await startRunFor(ctx, { workspaceId: ctx.workspaceId, userId: ctx.identity.subject, role: ctx.member.role, agentSlug: GROWTH_ARCHITECT, skillSlug: SKILL_SLUG, inputRef: requestId, clientId: kit.clientId, model: args.model });
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
    const tests = await testStates(ctx, ctx.workspaceId);
    const results = [];
    const withResult = new Set<string>();
    for (const asset of assets) {
      if (asset.createdByRun) withResult.add(asset.createdByRun);
      if (asset.status === "archived") continue;
      const saved = (await savedRecord(ctx.db, asset, "creative")) as CreativeRecord | null;
      if (!saved) continue;
      results.push({ id: asset._id, title: asset.title, status: asset.status, createdAt: asset.createdAt, brand: saved.kit.name, reference: saved.reference?.title ?? null, offer: saved.offer?.name ?? null, test: tests.get(asset._id) ?? null });
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
      /** The model that made it, as stored on its run. Null for older work. */
      model: await markOfAsset(ctx, asset),
      createdAt: asset.createdAt,
      versions: saved.versions,
      dial: { value: saved.dial, ...DIAL_WORDS[saved.dial] },
      kit: saved.kit,
      reference: saved.reference,
      offer: saved.offer,
      disclaimers: saved.disclaimers,
      creative: saved.creative,
      checks: saved.checks,
      test: await testFor(ctx, ctx.workspaceId, asset._id),
    };
  },
});

const one = (value: string) => value.replace(/\s+/g, " ").trim();

/**
 * A person's own edit to one variation of an ad set that is waiting for review. The checks run again on
 * their words exactly as they ran on the writer's: an edit that repeats the reference, breaks a brand rule or
 * states something nothing on record backs sends the set to Needs Review with the check named. The edit is
 * saved as a new version, and designed pictures of that variation are marked out of date. Owners, Admins and Members.
 */
export const edit = workspaceMutation({
  args: {
    assetId: v.id("assets"),
    variationKey: v.string(),
    hook: v.string(),
    primaryText: v.string(),
    headline: v.string(),
    cta: v.string(),
    eyebrow: v.string(),
    kicker: v.string(),
    subline: v.string(),
    labels: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.workspaceId !== ctx.workspaceId || asset.kind !== "adCopySet") notFound();
    if (asset.status !== "draft" && asset.status !== "needsReview") throw userError("Only an ad set that is waiting for review can be edited.");
    const run = asset.createdByRun ? await ctx.db.get(asset.createdByRun) : null;
    const saved = (await savedRecord(ctx.db, asset, "creative")) as CreativeRecord | null;
    const context = (await savedRecord(ctx.db, asset, "context")) as CreativeContext | null;
    if (!run || !saved?.creative || !context) notFound();
    const before = saved.creative.variations.find((row) => row.key === args.variationKey);
    if (!before) notFound();

    const fields = { hook: one(args.hook), primaryText: args.primaryText.replace(/[ \t]+/g, " ").trim(), headline: one(args.headline), cta: one(args.cta) };
    const design = { eyebrow: one(args.eyebrow), kicker: one(args.kicker), subline: one(args.subline), labels: args.labels.map(one).filter(Boolean) };
    for (const [name, value] of [["hook", fields.hook], ["text", fields.primaryText], ["headline", fields.headline], ["button", fields.cta]] as const) {
      if (!value) throw userError(`The ${name} cannot be blank.`);
    }
    const tooLong: [string, string, number][] = [
      ["hook", fields.hook, COPY_MAX.hook],
      ["text", fields.primaryText, COPY_MAX.primaryText],
      ["headline", fields.headline, COPY_MAX.headline],
      ["button", fields.cta, COPY_MAX.cta],
      ["top bar", design.eyebrow, COPY_MAX.eyebrow],
      ["line above the headline", design.kicker, COPY_MAX.kicker],
      ["line under the picture", design.subline, COPY_MAX.subline],
      ...design.labels.map((label): [string, string, number] => ["label", label, COPY_MAX.label]),
    ];
    for (const [name, value, max] of tooLong) {
      if (value.length > max) throw userError(`Keep the ${name} to ${max} characters. It is ${value.length}.`);
    }
    if (design.labels.length > COPY_MAX.labels) throw userError(`Keep to ${COPY_MAX.labels} labels.`);

    const earlier = before.design ?? { eyebrow: "", kicker: "", accent: "", visual: "", labels: [], subline: "" };
    const after: Variation = { ...before, ...fields, design: { ...earlier, ...design, accent: earlier.accent && fields.headline.includes(earlier.accent) ? earlier.accent : "" } };
    if (JSON.stringify(after) === JSON.stringify({ ...before, design: earlier })) return { status: asset.status, passed: saved.checks.passed, changed: false };
    const creative = { ...saved.creative, variations: saved.creative.variations.map((row) => (row.key === before.key ? after : row)) };

    // An edit costs nothing, so the run's own cost check carries over as it was.
    const rerun = runChecks({ creative, context, runCostCents: 0, capCents: 0 });
    const cost = saved.checks.results.find((row) => row.id === 7);
    const results = rerun.results.map((row) => (row.id === 7 && cost ? cost : row));
    const checks = { passed: results.every((row) => row.passed), results };

    const artifacts = await ctx.db
      .query("runArtifacts")
      .withIndex("by_workspace_run", (q) => q.eq("workspaceId", ctx.workspaceId).eq("runId", run._id))
      .order("desc")
      .take(300);
    const record = artifacts.find((row) => row.kind === "creative");
    if (!record) notFound();
    const version = asset.currentVersion + 1;
    const body = `${renderCreative(creative, context, checks, [])}\n_Variation ${before.key} was edited by a person._\n`;
    await writeVersion(ctx, run, asset._id, version, body, creativeClaims(creative, context, artifacts.find((row) => row.kind === "context")?._id ?? null), "person");
    const next = JSON.stringify({ ...saved, creative, checks, versions: version });
    // A new record beside the run's own, so what the writer produced stays as it was.
    await ctx.db.insert("runArtifacts", { workspaceId: ctx.workspaceId, runId: run._id, stepId: record.stepId, kind: "creative", byteSize: next.length, body: next });
    const status = checks.passed ? ("draft" as const) : ("needsReview" as const);
    await ctx.db.patch(asset._id, { status, currentVersion: version });

    // A designed picture carries its words. One drawn before the edit no longer matches.
    if (designText({ ...before, design: earlier }).join("\n") !== designText(after).join("\n")) {
      const images = await ctx.db
        .query("creativeImages")
        .withIndex("by_workspace_asset", (q) => q.eq("workspaceId", ctx.workspaceId).eq("assetId", asset._id))
        .take(200);
      for (const image of images) {
        if (image.variationKey === before.key && image.look === "designed" && image.status === "ready") await ctx.db.patch(image._id, { stale: true });
      }
    }
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "creative.edited", subject: `${asset._id}:${before.key}`, count: version });
    return { status, passed: checks.passed, changed: true };
  },
});
