import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const STAGES = [
  { name: "New", sort: 0, kind: "open" as const, meaning: "A lead that has not been worked." },
  { name: "Working", sort: 1, kind: "open" as const, meaning: "Someone is in contact." },
  { name: "Booked", sort: 2, kind: "open" as const, meaning: "A time is booked." },
  { name: "Won", sort: 3, kind: "won" as const, meaning: "The lead was won." },
  { name: "Lost", sort: 4, kind: "lost" as const, meaning: "The lead was lost." },
];

export async function seedSpine(ctx: MutationCtx, workspaceId: Id<"workspaces">) {
  const existing = await ctx.db
    .query("pipelineStages")
    .withIndex("by_workspace_sort", (q) => q.eq("workspaceId", workspaceId))
    .take(10);
  if (existing.length === 0) {
    for (const stage of STAGES) {
      await ctx.db.insert("pipelineStages", { workspaceId, ...stage });
    }
  }
  for (const key of ["manual", "csv"] as const) {
    const found = await ctx.db
      .query("sources")
      .withIndex("by_workspace_key", (q) => q.eq("workspaceId", workspaceId).eq("key", key))
      .unique();
    if (!found) {
      await ctx.db.insert("sources", { workspaceId, key, kind: key, status: "ready" });
    }
  }
}

export async function firstOpenStage(ctx: MutationCtx | QueryCtx, workspaceId: Id<"workspaces">) {
  const stages = await ctx.db
    .query("pipelineStages")
    .withIndex("by_workspace_sort", (q) => q.eq("workspaceId", workspaceId))
    .take(10);
  const open = stages.find((stage) => stage.kind === "open");
  if (!open) throw new Error("Not found.");
  return open;
}

export async function defaultCountry(ctx: MutationCtx | QueryCtx, workspaceId: Id<"workspaces">) {
  const settings = await ctx.db
    .query("workspaceSettings")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .unique();
  return settings?.defaultCountry?.trim().toUpperCase() || "US";
}
