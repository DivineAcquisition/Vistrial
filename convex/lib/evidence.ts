import type { GenericDatabaseReader } from "convex/server";

import type { DataModel, Id } from "../_generated/dataModel";

export type ClaimInput = {
  claimKey: string;
  statement: string;
  sourceId?: string;
  fetchedAt?: number;
  computed?: boolean;
};

/** A claim needs a source and a fetch time, or an explicit computed flag. */
export function claimsWithoutEvidence(claims: ClaimInput[]): string[] {
  return claims
    .filter((claim) => {
      const sourced = Boolean(claim.sourceId && claim.fetchedAt);
      return !sourced && claim.computed !== true;
    })
    .map((claim) => claim.claimKey);
}

export function assertClaims(claims: ClaimInput[]) {
  const missing = claimsWithoutEvidence(claims);
  if (missing.length > 0) {
    throw new Error("A claim needs evidence.");
  }
}

/** Records a claim may cite. Each one carries the workspace it belongs to. */
const SOURCE_TABLES = ["profileVersions", "profileExamples", "runArtifacts"] as const;

/** A cited source must be a real record in the same workspace. A made-up id like "none" fails. */
export async function assertSourcesExist(
  ctx: { db: GenericDatabaseReader<DataModel> },
  workspaceId: Id<"workspaces">,
  claims: ClaimInput[],
) {
  for (const claim of claims) {
    if (claim.computed === true && !claim.sourceId) continue;
    const found = await findSource(ctx, workspaceId, claim.sourceId ?? "");
    if (!found) throw new Error("A claim needs evidence.");
  }
}

/**
 * Claims on an asset version whose source is gone or never belonged to this workspace.
 * Same rule as the asset screen: a computed claim needs no source; any other claim needs one that still exists.
 */
export async function claimsMissingSource(
  ctx: { db: GenericDatabaseReader<DataModel> },
  workspaceId: Id<"workspaces">,
  assetVersionId: Id<"assetVersions">,
): Promise<string[]> {
  const missing: string[] = [];
  const rows = ctx.db
    .query("evidence")
    .withIndex("by_workspace_version", (q) => q.eq("workspaceId", workspaceId).eq("assetVersionId", assetVersionId));
  for await (const row of rows) {
    if (row.computed === true) continue;
    if (!row.sourceId || !(await findSource(ctx, workspaceId, row.sourceId))) missing.push(row.claimKey);
  }
  return missing;
}

async function findSource(ctx: { db: GenericDatabaseReader<DataModel> }, workspaceId: Id<"workspaces">, sourceId: string) {
  for (const table of SOURCE_TABLES) {
    const id = ctx.db.normalizeId(table, sourceId);
    if (!id) continue;
    const row = await ctx.db.get(id);
    return row !== null && row.workspaceId === workspaceId;
  }
  return false;
}
