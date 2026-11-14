/**
 * The landing pages Strategist built (Landing Page Build), for the Pages tab: each page's layout section by
 * section, with its status. Any member who may see the page's client reads it.
 */
import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { workspaceQuery } from "./lib/builders";
import { scopeValidator } from "./lib/clients";
import type { SavedPage } from "./skills/landingPageBuild/tools";

async function savedOf(ctx: QueryCtx, asset: Doc<"assets">): Promise<SavedPage | null> {
  if (!asset.createdByRun) return null;
  const rows = await ctx.db
    .query("runArtifacts")
    .withIndex("by_workspace_run", (q) => q.eq("workspaceId", asset.workspaceId).eq("runId", asset.createdByRun!))
    .take(300);
  const row = rows.reverse().find((item) => item.kind === "page" && item.body);
  if (!row?.body) return null;
  try {
    return JSON.parse(row.body) as SavedPage | null;
  } catch {
    return null;
  }
}

export const list = workspaceQuery({
  args: { scope: scopeValidator },
  handler: async (ctx, args) => {
    const assets = await ctx.db
      .query("assets")
      .withIndex("by_workspace_kind", (q) => q.eq("workspaceId", ctx.workspaceId).eq("kind", "landingPage"))
      .order("desc")
      .take(20);
    const out = [];
    for (const asset of ctx.clients.pick(assets, args.scope)) {
      if (asset.status === "archived" || asset.status === "rejected") continue;
      const saved = await savedOf(ctx, asset);
      out.push({
        id: asset._id,
        title: asset.title,
        status: asset.status,
        createdAt: asset.createdAt,
        layout: saved?.layout ?? null,
        failed: (saved?.checks.results ?? []).filter((row) => !row.passed).map((row) => `${row.name}: ${row.detail}`),
        leftOut: [...(saved?.context.gaps ?? []), ...(saved?.droppedResults ? ["Proof cards with nothing on record behind them were left out."] : [])],
      });
    }
    return out;
  },
});

export const get = workspaceQuery({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.workspaceId !== ctx.workspaceId || asset.kind !== "landingPage") return null;
    ctx.clients.require(asset.clientId);
    return { id: asset._id, title: asset.title, status: asset.status, saved: await savedOf(ctx, asset) };
  },
});
