import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { workspaceMutation, workspaceQuery, type MemberAccess } from "./lib/builders";
import { notAllowed, notFound } from "./lib/errors";
import { LIMITS, optionalText, requireText } from "./lib/research";

const ITEM_LIMIT = 500;

/**
 * A collection the caller can see: a workspace collection, or a private one they own. A private
 * collection of someone else reads as missing, the same as another workspace's.
 */
async function visible(ctx: QueryCtx & MemberAccess, collectionId: Id<"collections">) {
  const row = await ctx.db.get(collectionId);
  if (!row || row.workspaceId !== ctx.workspaceId) notFound();
  if (row.visibility === "private" && row.ownerUserId !== ctx.identity.subject) notFound();
  return row;
}

/** Its owner changes a collection. An Owner or Manager can also change a workspace collection. */
async function editable(ctx: MutationCtx & MemberAccess, collectionId: Id<"collections">) {
  const row = await visible(ctx, collectionId);
  const mine = row.ownerUserId === ctx.identity.subject;
  if (!mine && ctx.member.role === "rep") notAllowed();
  return row;
}

function view(row: Doc<"collections">, userId: string) {
  return {
    id: row._id,
    name: row.name,
    projectId: row.projectId ?? null,
    visibility: row.visibility,
    mine: row.ownerUserId === userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const create = workspaceMutation({
  args: {
    name: v.string(),
    visibility: v.union(v.literal("private"), v.literal("workspace")),
    projectId: v.optional(v.id("researchProjects")),
  },
  handler: async (ctx, args) => {
    // Anyone can keep a private collection. Sharing one with the workspace is an Owner or Manager's call.
    if (args.visibility === "workspace" && ctx.member.role === "rep") notAllowed();
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.workspaceId !== ctx.workspaceId) notFound();
    }
    const now = Date.now();
    return ctx.db.insert("collections", {
      workspaceId: ctx.workspaceId,
      projectId: args.projectId,
      name: requireText(args.name, LIMITS.collectionName, "a name"),
      visibility: args.visibility,
      ownerUserId: ctx.identity.subject,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Workspace collections and the caller's own private ones, optionally for one project. */
export const list = workspaceQuery({
  args: { projectId: v.optional(v.id("researchProjects")) },
  handler: async (ctx, args) => {
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.workspaceId !== ctx.workspaceId) notFound();
    }
    const shared = await ctx.db
      .query("collections")
      .withIndex("by_workspace_visibility", (q) => q.eq("workspaceId", ctx.workspaceId).eq("visibility", "workspace"))
      .take(100);
    const mine = await ctx.db
      .query("collections")
      .withIndex("by_workspace_owner", (q) => q.eq("workspaceId", ctx.workspaceId).eq("ownerUserId", ctx.identity.subject))
      .take(100);
    const seen = new Set<string>();
    return [...shared, ...mine]
      .filter((row) => (seen.has(row._id) ? false : (seen.add(row._id), true)))
      .filter((row) => !args.projectId || row.projectId === args.projectId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((row) => view(row, ctx.identity.subject));
  },
});

/** A collection and its items. An item whose source is gone stays listed as missing. */
export const get = workspaceQuery({
  args: { collectionId: v.id("collections") },
  handler: async (ctx, args) => {
    const row = await visible(ctx, args.collectionId);
    const items = await ctx.db
      .query("collectionItems")
      .withIndex("by_workspace_collection", (q) => q.eq("workspaceId", ctx.workspaceId).eq("collectionId", row._id))
      .take(ITEM_LIMIT);
    return {
      ...view(row, ctx.identity.subject),
      items: await Promise.all(
        items.map(async (item) => {
          const ref = await ctx.db.get(item.sourceRefId);
          const present = ref !== null && ref.workspaceId === ctx.workspaceId;
          return {
            sourceRefId: item.sourceRefId,
            note: item.note ?? null,
            addedAt: item.addedAt,
            missing: !present,
            platform: present ? ref.platform : null,
            title: present ? (ref.title ?? null) : null,
            url: present ? ref.url : null,
          };
        }),
      ),
    };
  },
});

export const rename = workspaceMutation({
  args: { collectionId: v.id("collections"), name: v.string() },
  handler: async (ctx, args) => {
    const row = await editable(ctx, args.collectionId);
    await ctx.db.patch(row._id, { name: requireText(args.name, LIMITS.collectionName, "a name"), updatedAt: Date.now() });
    return null;
  },
});

/** Deletes the collection and its items. The source references themselves stay. */
export const remove = workspaceMutation({
  args: { collectionId: v.id("collections") },
  handler: async (ctx, args) => {
    const row = await editable(ctx, args.collectionId);
    const items = await ctx.db
      .query("collectionItems")
      .withIndex("by_workspace_collection", (q) => q.eq("workspaceId", ctx.workspaceId).eq("collectionId", row._id))
      .take(ITEM_LIMIT + 1);
    for (const item of items) await ctx.db.delete(item._id);
    await ctx.db.delete(row._id);
    return null;
  },
});

export const addItem = workspaceMutation({
  args: { collectionId: v.id("collections"), sourceRefId: v.id("sourceRefs"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row = await editable(ctx, args.collectionId);
    const ref = await ctx.db.get(args.sourceRefId);
    if (!ref || ref.workspaceId !== ctx.workspaceId) notFound();
    const note = optionalText(args.note, LIMITS.note, "the note") || undefined;
    const existing = await ctx.db
      .query("collectionItems")
      .withIndex("by_workspace_collection_ref", (q) =>
        q.eq("workspaceId", ctx.workspaceId).eq("collectionId", row._id).eq("sourceRefId", ref._id),
      )
      .unique();
    if (existing) {
      if (note !== undefined) await ctx.db.patch(existing._id, { note });
      return existing._id;
    }
    const count = await ctx.db
      .query("collectionItems")
      .withIndex("by_workspace_collection", (q) => q.eq("workspaceId", ctx.workspaceId).eq("collectionId", row._id))
      .take(ITEM_LIMIT);
    if (count.length >= ITEM_LIMIT) throw new Error(`A collection holds at most ${ITEM_LIMIT} items.`);
    const id = await ctx.db.insert("collectionItems", {
      workspaceId: ctx.workspaceId,
      collectionId: row._id,
      sourceRefId: ref._id,
      note,
      addedBy: ctx.identity.subject,
      addedAt: Date.now(),
    });
    await ctx.db.patch(row._id, { updatedAt: Date.now() });
    return id;
  },
});

export const removeItem = workspaceMutation({
  args: { collectionId: v.id("collections"), sourceRefId: v.id("sourceRefs") },
  handler: async (ctx, args) => {
    const row = await editable(ctx, args.collectionId);
    const existing = await ctx.db
      .query("collectionItems")
      .withIndex("by_workspace_collection_ref", (q) =>
        q.eq("workspaceId", ctx.workspaceId).eq("collectionId", row._id).eq("sourceRefId", args.sourceRefId),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(row._id, { updatedAt: Date.now() });
    }
    return null;
  },
});
