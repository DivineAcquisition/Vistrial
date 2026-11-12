/**
 * Exporting an organization's data. An Owner starts it; it is built in the background into one .zip of
 * open formats (JSON, Markdown, plain text) and kept for a week. It works on an archived organization too.
 * What is exported, and what never is, is written out in lib/exportShape.ts.
 */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { ownerMutation, workspaceQuery } from "./lib/builders";
import { notAllowed, userError } from "./lib/errors";
import { EXPORT_PAGE, EXPORT_TABLES, exportable } from "./lib/exportShape";
import { isOwner } from "./lib/roles";

const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const BUILD_MS = 15 * 60 * 1000;
const MAX_PER_DAY = 5;

/** The tables an export may page through, and the index each is read by. Nothing else can be asked for. */
const INDEX: Record<string, string> = {
  ...Object.fromEntries(EXPORT_TABLES.map((row) => [row.table, "by_workspace"])),
  assetVersions: "by_workspace_asset",
  offerCardVersions: "by_workspace_card",
  brandKitVersions: "by_workspace_kit",
};

/** This organization's exports, newest first, each with its download link while it is kept. Owners only. */
export const list = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    if (!isOwner(ctx.role)) notAllowed();
    const rows = await ctx.db
      .query("organizationExports")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(10);
    const now = Date.now();
    return Promise.all(
      rows.map(async (row) => {
        const kept = row.status === "ready" && row.storageId !== undefined && (row.expiresAt ?? 0) > now;
        // A build that never reported back is shown as failed, so the Owner is not left waiting.
        const status = row.status === "building" && now - row.createdAt > BUILD_MS ? ("failed" as const) : row.status === "ready" && !kept ? ("expired" as const) : row.status;
        return {
          id: row._id,
          status,
          createdAt: row.createdAt,
          expiresAt: kept ? (row.expiresAt ?? null) : null,
          bytes: row.bytes ?? null,
          records: row.records ?? null,
          url: kept ? await ctx.storage.getUrl(row.storageId!) : null,
        };
      }),
    );
  },
});

/** Starts an export. Owners only; one at a time, and a few a day. */
export const start = ownerMutation({
  args: {},
  archivedToo: true,
  handler: async (ctx): Promise<Id<"organizationExports">> => {
    const now = Date.now();
    const recent = await ctx.db
      .query("organizationExports")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId).gt("createdAt", now - 24 * 60 * 60 * 1000))
      .take(MAX_PER_DAY + 1);
    if (recent.some((row) => row.status === "building" && now - row.createdAt < BUILD_MS)) throw userError("An export is already being built. It will be ready in a few minutes.");
    if (recent.length >= MAX_PER_DAY) throw userError(`Up to ${MAX_PER_DAY} exports a day. Try again tomorrow.`, "limit");
    const exportId = await ctx.db.insert("organizationExports", { workspaceId: ctx.workspaceId, requestedBy: ctx.identity.subject, status: "building", createdAt: now });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "organization.export_started", subject: exportId });
    await ctx.scheduler.runAfter(0, internal.exportActions.build, { exportId });
    return exportId;
  },
});

/** The export being built and its organization's name. Internal. */
export const job = internalQuery({
  args: { exportId: v.id("organizationExports") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.exportId);
    if (!row || row.status !== "building") return null;
    const workspace = await ctx.db.get(row.workspaceId);
    return workspace ? { workspaceId: row.workspaceId, name: workspace.name } : null;
  },
});

/** One page of one table of one organization, already stripped of what never leaves. Internal. */
export const page = internalQuery({
  args: { workspaceId: v.id("workspaces"), table: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const index = INDEX[args.table];
    if (!index) throw new Error("That table is not exported.");
    // The index starts with the organization, so a row of another organization cannot be read here.
    const result = await (ctx.db.query(args.table as "assets") as unknown as {
      withIndex: (name: string, range: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) => { paginate: (opts: { numItems: number; cursor: string | null }) => Promise<{ page: Record<string, unknown>[]; isDone: boolean; continueCursor: string }> };
    })
      .withIndex(index, (q) => q.eq("workspaceId", args.workspaceId))
      .paginate({ numItems: EXPORT_PAGE, cursor: args.cursor });
    return { rows: result.page.filter((row) => row.workspaceId === args.workspaceId).map((row) => exportable(row)), done: result.isDone, cursor: result.continueCursor };
  },
});

export const finish = internalMutation({
  args: { exportId: v.id("organizationExports"), storageId: v.id("_storage"), bytes: v.number(), records: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.exportId);
    if (!row || row.status !== "building") {
      await ctx.storage.delete(args.storageId);
      return null;
    }
    const now = Date.now();
    await ctx.db.patch(row._id, { status: "ready", storageId: args.storageId, bytes: args.bytes, records: args.records, finishedAt: now, expiresAt: now + KEEP_MS });
    await writeAudit(ctx, { workspaceId: row.workspaceId, actorType: "system", actorId: "export", action: "organization.exported", subject: row._id, count: args.records });
    return null;
  },
});

export const fail = internalMutation({
  args: { exportId: v.id("organizationExports") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.exportId);
    if (row?.status === "building") await ctx.db.patch(row._id, { status: "failed", finishedAt: Date.now() });
    return null;
  },
});

/** Removes export files past their week. The rows stay as the record. Run by cron; safe to run again. */
export const removeExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const due = await ctx.db
      .query("organizationExports")
      .withIndex("by_status_expires", (q) => q.eq("status", "ready").lt("expiresAt", Date.now()))
      .take(50);
    for (const row of due) {
      if (row.storageId) await ctx.storage.delete(row.storageId);
      await ctx.db.patch(row._id, { status: "expired", storageId: undefined });
    }
    return due.length;
  },
});
