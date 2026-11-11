/**
 * Reference ads a person adds themselves, for Creative Production: a public YouTube link, or a video or
 * image file they upload. Each is broken down once into its structure, and only that is kept. A video is
 * never downloaded from a platform, and an uploaded file is deleted as soon as it has been read.
 */

import { requireWork } from "./lib/roles";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { assertCanSpend, chargeUsage } from "./lib/billing";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { notFound, userError } from "./lib/errors";
import { MAX_IMAGE_BYTES, MAX_REFERENCES_PER_DAY, MAX_VIDEO_BYTES, REFERENCE_FAIL_WORDS, contentTypeOf, mediaKindOf, readReferenceLink } from "./lib/referenceShapes";
import { devSkillsEnabled } from "./lib/registry";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LISTED = 30;

export function referenceView(row: Doc<"creativeReferences">) {
  return {
    id: row._id,
    origin: row.origin,
    platform: row.platform,
    mediaKind: row.mediaKind,
    url: row.url ?? null,
    title: row.breakdown?.title || row.title,
    status: row.status,
    problem: row.status === "failed" ? (REFERENCE_FAIL_WORDS[row.failCode ?? ""] ?? "It could not be read.") : null,
    breakdown: row.breakdown ?? null,
    costCents: row.costCents,
    createdAt: row.createdAt,
  };
}

/** A one-time upload link for a reference file. Owners, Admins and Members. */
export const uploadUrl = workspaceMutation({
  args: {},
  handler: async (ctx) => {
    requireWork(ctx.member.role);
    return ctx.storage.generateUploadUrl();
  },
});

/**
 * Adds a reference and starts its breakdown. A link must be a public YouTube video: for TikTok, Instagram
 * and ad libraries the person is told to upload the file, because Vistrial does not take videos from those
 * platforms. A file needs the person's word that they may submit it; one we will not read is deleted and the
 * reason is returned as `problem`. Owners, Admins and Members.
 */
export const add = workspaceMutation({
  args: { url: v.optional(v.string()), storageId: v.optional(v.id("_storage")), name: v.optional(v.string()), attested: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
    if (Boolean(args.url?.trim()) === Boolean(args.storageId)) throw userError("Paste a link or upload a file, one at a time.");
    await assertCanSpend(ctx, ctx.workspaceId);
    const now = Date.now();
    const recent = await ctx.db
      .query("creativeReferences")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId).gt("createdAt", now - DAY_MS))
      .take(MAX_REFERENCES_PER_DAY + 1);
    const overLimit = recent.length >= MAX_REFERENCES_PER_DAY ? `Up to ${MAX_REFERENCES_PER_DAY} references a day. Try again tomorrow.` : null;

    const base = { workspaceId: ctx.workspaceId, status: "analysing" as const, costCents: 0, createdBy: ctx.identity.subject, createdAt: now };
    let referenceId;
    if (args.storageId) {
      const meta = await ctx.db.system.get(args.storageId);
      if (!meta) notFound();
      const name = (args.name ?? "").replace(/[^\w .()-]+/g, "").trim().slice(0, 120) || "reference";
      const mediaKind = mediaKindOf(meta.contentType ?? "", name);
      // A file we will not read is deleted, and the reason comes back as words. A refusal that threw would
      // undo the delete with the rest of the mutation, and the file would linger.
      const problem =
        overLimit ??
        (args.attested !== true
          ? "Confirm that you have the right to submit this file for analysis."
          : !mediaKind
            ? "Upload a video (MP4, MOV or WebM) or an image (PNG, JPG or WebP)."
            : mediaKind === "video" && meta.size > MAX_VIDEO_BYTES
              ? "That video is over 14 MB. Export a smaller copy (720p is plenty) and upload that."
              : mediaKind === "image" && meta.size > MAX_IMAGE_BYTES
                ? "That image is over 10 MB."
                : null);
      if (problem || !mediaKind) {
        await ctx.storage.delete(args.storageId);
        return { referenceId: null, problem: problem ?? "That file could not be used." };
      }
      referenceId = await ctx.db.insert("creativeReferences", { ...base, origin: "upload", platform: "upload", mediaKind, storageId: args.storageId, contentType: contentTypeOf(meta.contentType ?? "", name), title: name, attestedBy: ctx.identity.subject, attestedAt: now });
    } else {
      if (overLimit) throw userError(overLimit, "limit");
      const link = readReferenceLink(args.url ?? "");
      if (!link.ok) throw userError(link.problem);
      referenceId = await ctx.db.insert("creativeReferences", { ...base, origin: "link", platform: link.platform, mediaKind: "video", url: link.url, title: "YouTube video" });
    }
    await ctx.scheduler.runAfter(0, internal.referenceActions.analyse, { referenceId });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "reference.added", subject: referenceId });
    return { referenceId, problem: null };
  },
});

/** The references a person added, newest first. */
export const list = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("creativeReferences")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(MAX_LISTED);
    return rows.map(referenceView);
  },
});

/** Removes a reference and its file, if one is still held. Creatives already made from it keep their own record. Owners, Admins and Members. */
export const remove = workspaceMutation({
  args: { referenceId: v.id("creativeReferences") },
  handler: async (ctx, args) => {
    requireWork(ctx.member.role);
    const row = await ctx.db.get(args.referenceId);
    if (!row || row.workspaceId !== ctx.workspaceId) notFound();
    if (row.storageId) await ctx.storage.delete(row.storageId);
    await ctx.db.delete(row._id);
    return null;
  },
});

/** What the breakdown action needs: the reference, and the route for reading an image. */
export const forAnalysis = internalQuery({
  args: { referenceId: v.id("creativeReferences") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.referenceId);
    if (!row || row.status !== "analysing") return null;
    const route = await ctx.db
      .query("modelRoutes")
      .withIndex("by_workKind", (q) => q.eq("workKind", "classify"))
      .unique();
    return { reference: row, route: route ?? (devSkillsEnabled() ? { provider: "fake", model: "fake-writer", fallbackProvider: "fake", fallbackModel: "fake-writer" } : null) };
  },
});

const breakdownValidator = v.object({
  title: v.string(),
  advertiser: v.string(),
  lengthSeconds: v.number(),
  format: v.string(),
  hook: v.object({ type: v.string(), words: v.string() }),
  beats: v.array(v.object({ seconds: v.string(), what: v.string() })),
  onScreenText: v.array(v.string()),
  spoken: v.string(),
  offer: v.string(),
  cta: v.object({ words: v.string(), placement: v.string() }),
  audience: v.string(),
});

/**
 * Saves the breakdown or the reason it failed, charges what the read really cost, and deletes the uploaded
 * file either way: only the breakdown is kept.
 */
export const saveAnalysis = internalMutation({
  args: { referenceId: v.id("creativeReferences"), breakdown: v.optional(breakdownValidator), failCode: v.optional(v.string()), costCents: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.referenceId);
    if (!row) return null;
    if (row.storageId) await ctx.storage.delete(row.storageId);
    await ctx.db.replace(row._id, {
      workspaceId: row.workspaceId,
      origin: row.origin,
      platform: row.platform,
      mediaKind: row.mediaKind,
      ...(row.url ? { url: row.url } : {}),
      ...(row.contentType ? { contentType: row.contentType } : {}),
      title: row.title,
      status: args.breakdown ? "ready" : "failed",
      ...(args.breakdown ? { breakdown: args.breakdown } : { failCode: args.failCode ?? "provider_error" }),
      costCents: row.costCents + args.costCents,
      ...(row.attestedBy ? { attestedBy: row.attestedBy, attestedAt: row.attestedAt } : {}),
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    });
    await chargeUsage(ctx, { workspaceId: row.workspaceId, costCents: args.costCents, source: "file", ref: row._id });
    return null;
  },
});
