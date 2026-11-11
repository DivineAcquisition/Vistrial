import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { normalName } from "./clients";
import { isAdmin } from "./lib/roles";

/**
 * Brand kits already had "one for the business and one per client", where a client was only the kit's
 * name. This turns each of those into a real client (docs/rebuild/organizations-and-clients.md, 3.3):
 *
 *   - every kit of kind "client" with no `clientId` gets a business client named after it (website and
 *     industry copied from the kit's current version), or is linked to the active client that already
 *     has that name;
 *   - so that nobody loses sight of a kit they could open before, each active Member and Viewer of the
 *     organization is assigned to every client made here.
 *
 * Kits, versions, logos and creatives are not touched. A linked kit is skipped, so running it again
 * changes nothing. A cron calls `backfillIfNeeded`; `remaining` must read zero.
 */

const KITS_PER_BATCH = 50;

async function linkKit(ctx: MutationCtx, kit: Doc<"brandKits">) {
  const active = await ctx.db
    .query("clients")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", kit.workspaceId).eq("status", "active"))
    .take(1000);
  const wanted = normalName(kit.name);
  let clientId = active.find((row) => row.normalizedName === wanted)?._id;
  if (!clientId) {
    const versions = await ctx.db
      .query("brandKitVersions")
      .withIndex("by_workspace_kit", (q) => q.eq("workspaceId", kit.workspaceId).eq("kitId", kit._id))
      .take(200);
    const current = versions.find((row) => row.version === kit.currentVersion);
    const now = Date.now();
    clientId = await ctx.db.insert("clients", {
      workspaceId: kit.workspaceId,
      type: "business",
      name: kit.name.trim().slice(0, 80) || "Client",
      normalizedName: wanted,
      status: "active",
      business: { website: current?.website ?? "", industry: current?.industry ?? "", offer: "", audience: "", geography: "", notes: "" },
      createdBy: kit.createdBy,
      createdAt: now,
      updatedAt: now,
    });
    const members = await ctx.db
      .query("members")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", kit.workspaceId))
      .take(500);
    for (const member of members) {
      if (!member.active || isAdmin(member.role)) continue;
      await ctx.db.insert("clientAssignments", { workspaceId: kit.workspaceId, clientId, memberId: member._id, assignedBy: "system", assignedAt: now });
    }
  }
  await ctx.db.patch(kit._id, { clientId });
}

export const backfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    const kits = await ctx.db
      .query("brandKits")
      .withIndex("by_kind_client", (q) => q.eq("kind", "client").eq("clientId", undefined))
      .take(KITS_PER_BATCH);
    for (const kit of kits) await linkKit(ctx, kit);
    const more = kits.length === KITS_PER_BATCH;
    if (more) await ctx.scheduler.runAfter(0, internal.clientsMigration.backfill, {});
    return { linked: kits.length, done: !more };
  },
});

/** Starts the backfill only when a client kit is still unlinked. One index read once it is done. */
export const backfillIfNeeded = internalMutation({
  args: {},
  handler: async (ctx) => {
    const one = await ctx.db
      .query("brandKits")
      .withIndex("by_kind_client", (q) => q.eq("kind", "client").eq("clientId", undefined))
      .first();
    if (!one) return false;
    await ctx.scheduler.runAfter(0, internal.clientsMigration.backfill, {});
    return true;
  },
});

export const remaining = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("brandKits")
      .withIndex("by_kind_client", (q) => q.eq("kind", "client").eq("clientId", undefined))
      .take(args.limit ?? 1000);
    return { clientKitsWithoutClient: rows.length };
  },
});
