/**
 * Notes to self on the Tasks board: a person's own reminders. No agent, no assignment, and only their
 * author ever reads them, whatever their role, so a Viewer can keep them too.
 */
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { selfMutation, workspaceQuery } from "./lib/builders";
import { clientForNew } from "./lib/clients";
import { notFound, userError } from "./lib/errors";

const MAX_BODY = 500;
const MAX_NOTES = 200;

async function ownNote(ctx: QueryCtx & { workspaceId: Id<"workspaces">; identity: { subject: string } }, noteId: Id<"personalNotes">) {
  const note = await ctx.db.get(noteId);
  // Someone else's note does not exist, exactly like one in another organization.
  if (!note || note.workspaceId !== ctx.workspaceId || note.userId !== ctx.identity.subject) notFound();
  return note;
}

const clean = (body: string) => {
  const text = body.replace(/\s+/g, " ").trim().slice(0, MAX_BODY);
  if (!text) throw userError("Write the note first.");
  return text;
};

/** The caller's own notes: open ones first, newest first. */
export const mine = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("personalNotes")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", ctx.workspaceId).eq("userId", ctx.identity.subject))
      .order("desc")
      .take(MAX_NOTES);
    const names = new Map<string, string>();
    const out = [];
    for (const row of rows) {
      if (row.clientId && !names.has(row.clientId)) names.set(row.clientId, (await ctx.db.get(row.clientId))?.name ?? "A client");
      out.push({ id: row._id, body: row.body, done: row.done === true, client: row.clientId ? (names.get(row.clientId) ?? null) : null, createdAt: row.createdAt });
    }
    return out.sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt - a.createdAt);
  },
});

export const add = selfMutation({
  args: { body: v.string(), clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const body = clean(args.body);
    const forClient = args.clientId ? await clientForNew(ctx, args.clientId) : {};
    const existing = await ctx.db
      .query("personalNotes")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", ctx.workspaceId).eq("userId", ctx.identity.subject))
      .take(MAX_NOTES);
    if (existing.length >= MAX_NOTES) throw userError(`You can keep ${MAX_NOTES} notes. Remove one first.`, "limit");
    const now = Date.now();
    return ctx.db.insert("personalNotes", { workspaceId: ctx.workspaceId, userId: ctx.identity.subject, ...forClient, body, createdAt: now, updatedAt: now });
  },
});

export const update = selfMutation({
  args: { personalNoteId: v.id("personalNotes"), body: v.optional(v.string()), done: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const note = await ownNote(ctx, args.personalNoteId);
    await ctx.db.patch(note._id, { ...(args.body !== undefined ? { body: clean(args.body) } : {}), ...(args.done !== undefined ? { done: args.done } : {}), updatedAt: Date.now() });
    return null;
  },
});

export const remove = selfMutation({
  args: { personalNoteId: v.id("personalNotes") },
  handler: async (ctx, args) => {
    const note = await ownNote(ctx, args.personalNoteId);
    await ctx.db.delete(note._id);
    return null;
  },
});
