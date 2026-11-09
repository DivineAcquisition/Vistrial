import type { GenericDatabaseReader } from "convex/server";

import type { DataModel, Doc } from "../_generated/dataModel";
import { parseJson } from "../skills/marketIntelligence/shapes";

type Db = GenericDatabaseReader<DataModel>;

/**
 * The newest record of one kind saved by the run that made an asset: the structured answer a screen draws
 * from, so screens never parse an asset's Markdown. Null when the asset has no run, or the run is another
 * workspace's.
 */
export async function savedRecord(db: Db, asset: Pick<Doc<"assets">, "workspaceId" | "createdByRun">, kind: string): Promise<unknown> {
  if (!asset.createdByRun) return null;
  const run = await db.get(asset.createdByRun);
  if (!run || run.workspaceId !== asset.workspaceId) return null;
  const rows = await db
    .query("runArtifacts")
    .withIndex("by_workspace_run", (q) => q.eq("workspaceId", asset.workspaceId).eq("runId", run._id))
    .order("desc")
    .take(300);
  return parseJson(rows.find((row) => row.kind === kind)?.body);
}
