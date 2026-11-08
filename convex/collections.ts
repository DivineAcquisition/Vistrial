import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { workspaceMutation, workspaceQuery, type MemberAccess } from "./lib/builders";
import { notAllowed, notFound } from "./lib/errors";
import { sourceRefView } from "./lib/sourceRefs";

const MAX_NAME = 80;
const MAX_NOTE = 500;
const MAX_ITEMS = 500;

/**
 * A personal collection is seen only by the person who made it. A workspace collection is seen by
 * every member, and changed by an Owner or Manager. Anything else reads as not found.
 */
async function readable(ctx: QueryCtx & MemberAccess, collectionId: Id<"collections">) {
  const row = await ctx.db.get(collectionId);
  if (!row || row.workspaceId !== ctx.workspaceId) notFound();
  if (row.ownerUserId !== undefined && row.ownerUserId !== ctx.identity.subject) notFound();
  return row;
}

async function editable(ctx: QueryCtx & MemberAccess, collectionId: Id<"collections">) {
  const row = await readable(ctx, collectionId);
  if (row.ownerUserId === undefined && ctx.member.role === "rep") notAllowed();
  return row;
}

function cleanName(name: string) {
  const clean = name.trim();
  if (clean.length === 0 || clean.length > MAX_NAME) throw new Error(`Give the collection a name of up to ${MAX_NAME} characters.`);
  return clean;
}

function view(row: Doc<"collections">, items: number) {
  return {
    id: row._id,
    name: row.name,
    projectId: row.projectId ?? null,
    shared: row.ownerUserId === undefined,
    createdAt: row.createdAt,
    items,
  };
}

/** Anyone can make a personal collection. Only an Owner or Manager can make a workspace one. */
export const create = workspaceMutation({
  args: { name: v.string(), shared: v.boolean(), projectId: v.optional(v.id("researchProjects")) },
  handler: async (ctx, args) => {
    if (args.shared && ctx.member.role === "rep") notAllowed();
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.workspaceId !== ctx.workspaceId) notFound();
    }
    return ctx.db.insert("collections", {
      workspaceId: ctx.workspaceId,
      projectId: args.projectId,
      name: cleanName(args.name),
      ownerUserId: args.shared ? undefined : ctx.identity.subject,
      createdBy: ctx.identity.subject,
      createdAt: Date.now(),
    });
  },
});

export const rename = workspaceMutation({
  args: { collectionId: v.id("collections"), name: v.string() },
  handler: async (ctx, args) => {
    const row = await editable(ctx, args.collectionId);
    await ctx.db.patch(row._id, { name: cleanName(args.name) });
    return null;
  },
});

/** Removes the collection and its items. The source references stay. */
export const remove = workspaceMutation({
  args: { collectionId: v.id("collections") },
  handler: async (ctx, args) => {
    const row = await editable(ctx, args.collectionId);
    const items = await ctx.db
      .query("collectionItems")
      .withIndex("by_workspace_collection", (q) => q.eq("workspaceId", ctx.workspaceId).eq("collectionId", row._id))
      .take(MAX_ITEMS + 1);
    for (const item of items) await ctx.db.delete(item._id);
    await ctx.db.delete(row._id);
    return null;
  },
});

async function itemCount(ctx: QueryCtx, workspaceId: Id<"workspaces">, collectionId: Id<"collections">) {
  return (
    await ctx.db
      .query("collectionItems")
      .withIndex("by_workspace_collection", (q) => q.eq("workspaceId", workspaceId).eq("collectionId", collectionId))
      .take(MAX_ITEMS)
  ).length;
}

/** The workspace's collections and the caller's own, optionally for one project. */
export const list = workspaceQuery({
  args: { projectId: v.optional(v.id("researchProjects")) },
  handler: async (ctx, args) => {
    const shared = await ctx.db
      .query("collections")
      .withIndex("by_workspace_owner", (q) => q.eq("workspaceId", ctx.workspaceId).eq("ownerUserId", undefined))
      .take(100);
    const mine = await ctx.db
      .query("collections")
      .withIndex("by_workspace_owner", (q) => q.eq("workspaceId", ctx.workspaceId).eq("ownerUserId", ctx.identity.subject))
      .take(100);
    const rows = [...shared, ...mine]
      .filter((row) => args.projectId === undefined || row.projectId === args.projectId)
      .sort((a, b) => b.createdAt - a.createdAt);
    return Promise.all(rows.map(async (row) => view(row, await itemCount(ctx, ctx.workspaceId, row._id))));
  },
});

/** Saves a source to a collection. Saving it again changes nothing. */
export const addItem = workspaceMutation({
  args: { collectionId: v.id("collections"), sourceRefId: v.id("sourceRefs"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const collection = await editable(ctx, args.collectionId);
    const ref = await ctx.db.get(args.sourceRefId);
    if (!ref || ref.workspaceId !== ctx.workspaceId) notFound();
    const note = args.note?.trim();
    if (note && note.length > MAX_NOTE) throw new Error(`Keep the note to ${MAX_NOTE} characters.`);
    const existing = await ctx.db
      .query("collectionItems")
      .withIndex("by_workspace_collection", (q) =>
        q.eq("workspaceId", ctx.workspaceId).eq("collectionId", collection._id).eq("sourceRefId", ref._id),
      )
      .unique();
    if (existing) return existing._id;
    if ((await itemCount(ctx, ctx.workspaceId, collection._id)) >= MAX_ITEMS) throw new Error("This collection is full.");
    return ctx.db.insert("collectionItems", {
      workspaceId: ctx.workspaceId,
      collectionId: collection._id,
      sourceRefId: ref._id,
      note: note || undefined,
      addedBy: ctx.identity.subject,
      addedAt: Date.now(),
    });
  },
});

export const removeItem = workspaceMutation({
  args: { collectionId: v.id("collections"), sourceRefId: v.id("sourceRefs") },
  handler: async (ctx, args) => {
    const collection = await editable(ctx, args.collectionId);
    const existing = await ctx.db
      .query("collectionItems")
      .withIndex("by_workspace_collection", (q) =>
        q.eq("workspaceId", ctx.workspaceId).eq("collectionId", collection._id).eq("sourceRefId", args.sourceRefId),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

/** A collection's sources, newest saved first. */
export const items = workspaceQuery({
  args: { collectionId: v.id("collections") },
  handler: async (ctx, args) => {
    const collection = await readable(ctx, args.collectionId);
    const rows = await ctx.db
      .query("collectionItems")
      .withIndex("by_workspace_collection", (q) => q.eq("workspaceId", ctx.workspaceId).eq("collectionId", collection._id))
      .take(MAX_ITEMS);
    const out = [];
    for (const row of rows.sort((a, b) => b.addedAt - a.addedAt)) {
      const ref = await ctx.db.get(row.sourceRefId);
      if (!ref || ref.workspaceId !== ctx.workspaceId) continue;
      out.push({ note: row.note ?? null, addedAt: row.addedAt, source: sourceRefView(ref) });
    }
    return { collection: view(collection, rows.length), items: out };
  },
});
