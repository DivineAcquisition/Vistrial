/**
 * Copying material from one of an Owner's organizations into another, as reference its agents can read.
 * An Owner of the account only, between two organizations of the same account. What is copied is a
 * snapshot of an approved report or offer analysis that was not made for a client. Connections, tokens,
 * people, clients, brand kits, results files and call transcripts are never copied.
 */
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { adminMutation, ownerMutation, workspaceQuery } from "./lib/builders";
import { clientOfAsset } from "./lib/clients";
import { notAllowed, notFound, userError } from "./lib/errors";
import { isAdmin, isOwner } from "./lib/roles";
import { COPYABLE_KINDS, KIND_WORDS, MAX_REFERENCES, MAX_REFERENCE_CHARS } from "./lib/sharedReferences";

const MAX_LISTED = 50;

/** The caller's other organizations they may copy from: same account, and they are an Owner there. Archived ones count. */
async function sourcesFor(ctx: QueryCtx, workspaceId: Id<"workspaces">, userId: string): Promise<Doc<"workspaces">[]> {
  const here = await ctx.db.get(workspaceId);
  if (!here?.accountId) return [];
  const rows = await ctx.db
    .query("workspaces")
    .withIndex("by_account", (q) => q.eq("accountId", here.accountId))
    .take(60);
  const out: Doc<"workspaces">[] = [];
  for (const row of rows) {
    if (row._id === workspaceId) continue;
    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", row._id).eq("userId", userId))
      .unique();
    if (member?.active && isOwner(member.role)) out.push(row);
  }
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

/** The current written version of an asset, when it has one. */
async function currentBody(ctx: QueryCtx, asset: Doc<"assets">): Promise<string | null> {
  const versions = await ctx.db
    .query("assetVersions")
    .withIndex("by_workspace_asset", (q) => q.eq("workspaceId", asset.workspaceId).eq("assetId", asset._id))
    .take(200);
  const body = versions.find((row) => row.version === asset.currentVersion)?.body;
  return body && body.trim() ? body : null;
}

async function copyable(ctx: QueryCtx, asset: Doc<"assets">): Promise<boolean> {
  if (asset.status !== "approved" || !(COPYABLE_KINDS as readonly string[]).includes(asset.kind)) return false;
  // Work done for a client stays with the people assigned to that client.
  return (await clientOfAsset(ctx, asset)) === undefined;
}

/** What is copied in here, newest first. Anyone who may see the organization's own work. */
export const list = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const owner = isOwner(ctx.role);
    if (!ctx.clients.sees(undefined)) return { items: [], canCopy: false, canRemove: false, limit: MAX_REFERENCES };
    const rows = await ctx.db
      .query("sharedReferences")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(MAX_REFERENCES);
    return {
      items: rows.map((row) => ({
        id: row._id,
        title: row.title,
        kind: KIND_WORDS[row.kind] ?? "Document",
        fromName: row.fromName,
        copiedAt: row.copiedAt,
        copiedByName: row.copiedByName,
        chars: row.body.length,
        cut: row.cut === true,
      })),
      canCopy: owner,
      canRemove: isAdmin(ctx.role),
      limit: MAX_REFERENCES,
    };
  },
});

/** One copied piece, to read. */
export const get = workspaceQuery({
  args: { referenceId: v.id("sharedReferences") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.referenceId);
    if (!row || row.workspaceId !== ctx.workspaceId || !ctx.clients.sees(undefined)) notFound();
    return { id: row._id, title: row.title, fromName: row.fromName, body: row.body, cut: row.cut === true };
  },
});

/** What the Owner could copy in: their other organizations and each one's approved reports and offer analyses. Owners only. */
export const sources = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    if (!isOwner(ctx.role)) notAllowed();
    const copied = await ctx.db
      .query("sharedReferences")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .take(MAX_REFERENCES);
    const out = [];
    for (const organization of await sourcesFor(ctx, ctx.workspaceId, ctx.identity.subject)) {
      const assets = await ctx.db
        .query("assets")
        .withIndex("by_workspace_status", (q) => q.eq("workspaceId", organization._id).eq("status", "approved"))
        .order("desc")
        .take(200);
      const items = [];
      for (const asset of assets) {
        if (items.length >= MAX_LISTED) break;
        if (!(await copyable(ctx, asset)) || !(await currentBody(ctx, asset))) continue;
        items.push({
          assetId: asset._id,
          title: asset.title,
          kind: KIND_WORDS[asset.kind] ?? "Document",
          createdAt: asset.createdAt,
          copied: copied.some((row) => row.sourceAssetId === asset._id && row.sourceVersion === asset.currentVersion),
        });
      }
      out.push({ workspaceId: organization._id, name: organization.name, archived: organization.status === "archived", items });
    }
    return out;
  },
});

/** Copies one approved report or offer analysis from another of the Owner's organizations into this one. */
export const copy = ownerMutation({
  args: { fromWorkspaceId: v.id("workspaces"), assetId: v.id("assets") },
  handler: async (ctx, args): Promise<Id<"sharedReferences">> => {
    const allowed = await sourcesFor(ctx, ctx.workspaceId, ctx.identity.subject);
    const source = allowed.find((row) => row._id === args.fromWorkspaceId);
    // An organization of another account, or one the caller is not an Owner of, does not exist to them.
    if (!source) notFound();
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.workspaceId !== source._id) notFound();
    if (!(await copyable(ctx, asset))) throw userError("Only an approved report or offer analysis that was not made for a client can be copied.");
    const body = await currentBody(ctx, asset);
    if (!body) throw userError("That document has no written version to copy.");
    const existing = await ctx.db
      .query("sharedReferences")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .take(MAX_REFERENCES + 1);
    if (existing.some((row) => row.sourceAssetId === asset._id && row.sourceVersion === asset.currentVersion)) throw userError("That version is already copied here.");
    if (existing.length >= MAX_REFERENCES) throw userError(`An organization keeps up to ${MAX_REFERENCES} copied documents. Remove one first.`, "limit");
    const referenceId = await ctx.db.insert("sharedReferences", {
      workspaceId: ctx.workspaceId,
      fromWorkspaceId: source._id,
      fromName: source.name,
      sourceAssetId: asset._id,
      sourceVersion: asset.currentVersion,
      kind: asset.kind,
      title: asset.title,
      body: body.slice(0, MAX_REFERENCE_CHARS),
      ...(body.length > MAX_REFERENCE_CHARS ? { cut: true } : {}),
      copiedBy: ctx.identity.subject,
      copiedByName: ctx.member.displayName,
      copiedAt: Date.now(),
    });
    // Recorded on both sides: what came in here, and what left there. Ids only, never the text.
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "reference.copied_in", subject: referenceId });
    await writeAudit(ctx, { workspaceId: source._id, actorType: "user", actorId: ctx.identity.subject, action: "reference.copied_out", subject: asset._id });
    return referenceId;
  },
});

/** Removes a copied piece from this organization. The original is untouched. Owners and Admins. */
export const remove = adminMutation({
  args: { referenceId: v.id("sharedReferences") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.referenceId);
    if (!row || row.workspaceId !== ctx.workspaceId) notFound();
    await ctx.db.delete(row._id);
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "reference.removed", subject: row._id });
    return null;
  },
});
