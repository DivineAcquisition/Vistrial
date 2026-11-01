import type { GenericDatabaseReader } from "convex/server";

import type { DataModel, Id } from "../_generated/dataModel";

export type ClaimInput = {
  claimKey: string;
  statement: string;
  sourceId?: string;
  fetchedAt?: number;
  computed?: boolean;
};

/** Same words as the asset page, so a refused approval reads the same as the disabled button. */
export const MISSING_SOURCE = "A claim has no source, so it cannot be approved yet.";

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

/**
 * Claims whose cited source is not a real record in the workspace: a made-up id like "none", a record
 * from another workspace, or one that has since been deleted. A computed claim needs no source.
 */
export async function claimsWithMissingSources(
  ctx: { db: GenericDatabaseReader<DataModel> },
  workspaceId: Id<"workspaces">,
  claims: Pick<ClaimInput, "claimKey" | "sourceId" | "computed">[],
): Promise<string[]> {
  const missing: string[] = [];
  for (const claim of claims) {
    if (claim.computed === true && !claim.sourceId) continue;
    if (!(await findSource(ctx, workspaceId, claim.sourceId ?? ""))) missing.push(claim.claimKey);
  }
  return missing;
}

/** A cited source must be a real record in the same workspace. A made-up id like "none" fails. */
export async function assertSourcesExist(
  ctx: { db: GenericDatabaseReader<DataModel> },
  workspaceId: Id<"workspaces">,
  claims: ClaimInput[],
) {
  if ((await claimsWithMissingSources(ctx, workspaceId, claims)).length > 0) {
    throw new Error("A claim needs evidence.");
  }
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
