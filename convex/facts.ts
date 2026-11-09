import { v } from "convex/values";

import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { writeAudit } from "./lib/audit";
import { notAllowed, notFound, userError } from "./lib/errors";
import { FACT_TEXT, cleanFactKey, factView, isLive, liveFact, writeFact } from "./lib/facts";

function assertEditor(role: string) {
  if (role === "rep") notAllowed();
}

/** The workspace's current facts, newest first. Every member can read them. */
export const list = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("businessFacts")
      .withIndex("by_workspace_key", (q) => q.eq("workspaceId", ctx.workspaceId))
      .take(2000);
    return rows
      .filter(isLive)
      .sort((a, b) => b.recordedAt - a.recordedAt)
      .map(factView);
  },
});

/** Every row ever written for one key, newest first, including replaced and removed ones. */
export const history = workspaceQuery({
  args: { factKey: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("businessFacts")
      .withIndex("by_workspace_key", (q) => q.eq("workspaceId", ctx.workspaceId).eq("factKey", cleanFactKey(args.factKey)))
      .order("desc")
      .take(100);
    return rows.map(factView);
  },
});

/**
 * A person states a fact. It is verified, because the person stated it. A fact already on the key is
 * replaced: the new row supersedes it, and the old row is kept.
 */
export const record = workspaceMutation({
  args: { factKey: v.string(), value: v.string(), sourceReference: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertEditor(ctx.member.role);
    return writeFact(ctx, {
      workspaceId: ctx.workspaceId,
      factKey: args.factKey,
      value: args.value,
      sourceType: "owner",
      sourceReference: args.sourceReference,
      recordedBy: ctx.identity.subject,
      verifiedBy: ctx.identity.subject,
    });
  },
});

/** Only an Owner or Manager verifies or disputes a fact. An agent never verifies its own. */
export const setStatus = workspaceMutation({
  args: { factId: v.id("businessFacts"), status: v.union(v.literal("verified"), v.literal("disputed")) },
  handler: async (ctx, args) => {
    assertEditor(ctx.member.role);
    const row = await ctx.db.get(args.factId);
    if (!row || row.workspaceId !== ctx.workspaceId) notFound();
    if (!isLive(row)) throw userError(FACT_TEXT.notLive);
    // Verification history stays when a fact is later disputed.
    await ctx.db.patch(row._id, {
      status: args.status,
      ...(args.status === "verified" ? { verifiedAt: Date.now(), verifiedBy: ctx.identity.subject } : {}),
    });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: `fact.${args.status}`,
      subject: row._id,
    });
    return null;
  },
});

/** Removes the current fact for a key. A soft delete, audited. The row and its history stay. */
export const remove = workspaceMutation({
  args: { factId: v.id("businessFacts") },
  handler: async (ctx, args) => {
    assertEditor(ctx.member.role);
    const row = await ctx.db.get(args.factId);
    if (!row || row.workspaceId !== ctx.workspaceId) notFound();
    if (!isLive(row)) throw userError(FACT_TEXT.notLive);
    await ctx.db.patch(row._id, { deletedAt: Date.now(), deletedBy: ctx.identity.subject });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "fact.removed",
      subject: row._id,
    });
    return null;
  },
});

/** The current fact for one key, or null. */
export const get = workspaceQuery({
  args: { factKey: v.string() },
  handler: async (ctx, args) => {
    const row = await liveFact(ctx, ctx.workspaceId, cleanFactKey(args.factKey));
    return row ? factView(row) : null;
  },
});
