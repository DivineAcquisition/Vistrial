/**
 * Which model made a record, for showing its mark. Read from what was stored on the run when it ran, never
 * worked out afterwards: a record from before this was kept has none, and a screen shows nothing for it.
 * Every lookup checks the record belongs to the organization asking.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { markOf, type ModelMark } from "./models";

type Reader = Pick<QueryCtx, "db">;

export async function markOfRun(ctx: Reader, workspaceId: Id<"workspaces">, runId: Id<"agentRuns"> | null | undefined): Promise<ModelMark | null> {
  const run = runId ? await ctx.db.get(runId) : null;
  return run && run.workspaceId === workspaceId ? markOf(run.madeWith) : null;
}

/** An asset carries the model of the run that made it. */
export function markOfAsset(ctx: Reader, asset: Pick<Doc<"assets">, "workspaceId" | "createdByRun">): Promise<ModelMark | null> {
  return markOfRun(ctx, asset.workspaceId, asset.createdByRun);
}

/** A Briefing post about a run, or about an asset a run made. Any other post has no model behind it. */
export async function markOfRef(ctx: Reader, workspaceId: Id<"workspaces">, table: string | undefined, id: string | undefined): Promise<ModelMark | null> {
  if (!table || !id) return null;
  if (table === "agentRuns") return markOfRun(ctx, workspaceId, ctx.db.normalizeId("agentRuns", id));
  if (table === "assets") {
    const assetId = ctx.db.normalizeId("assets", id);
    const asset = assetId ? await ctx.db.get(assetId) : null;
    return asset && asset.workspaceId === workspaceId ? markOfAsset(ctx, asset) : null;
  }
  return null;
}
