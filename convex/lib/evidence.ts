import type { GenericDatabaseReader } from "convex/server";

import type { DataModel, Id } from "../_generated/dataModel";

/**
 * What a claim stands on.
 * - observed: seen in a source; needs at least one source.
 * - inferred: reasoned from sources; needs at least one supporting source, and is shown as an inference.
 * - hypothesis: an idea to test; needs no source, and is always shown as untested.
 * - firstParty: from the business's own data; every source must be the business's own record.
 * - insufficient: the "Not enough data" line; it makes no claim, so it cites nothing.
 */
export const BASES = ["observed", "inferred", "hypothesis", "firstParty", "insufficient"] as const;

export type Basis = (typeof BASES)[number];

export type ClaimInput = {
  claimKey: string;
  statement: string;
  basis?: Basis;
  /** Sources the claim stands on. `sourceId` is the single-source form older claims use. */
  sourceIds?: string[];
  sourceId?: string;
  fetchedAt?: number;
  /** A number or date computed by code over its sources, never written by a model. */
  computed?: boolean;
};

/** Same words as the asset page, so a refused approval reads the same as the disabled button. */
export const MISSING_SOURCE = "A claim has no source, so it cannot be approved yet.";

/** Records a claim may cite. Each one carries the workspace it belongs to. */
const SOURCE_TABLES = ["profileVersions", "profileExamples", "runArtifacts"] as const;

/** The business's own records. Only these can back a firstParty claim. */
const FIRST_PARTY_TABLES = new Set<string>(["profileVersions", "profileExamples"]);

export function citedSources(claim: Pick<ClaimInput, "sourceIds" | "sourceId">): string[] {
  return [...new Set([...(claim.sourceIds ?? []), ...(claim.sourceId ? [claim.sourceId] : [])])];
}

/** The shape each basis requires, before any source is looked up. */
function shapeHolds(claim: ClaimInput) {
  const sources = citedSources(claim).length;
  switch (claim.basis) {
    case undefined:
      // Older claims, written before a basis existed: a source with a fetch time, or computed.
      return Boolean(claim.sourceId && claim.fetchedAt) || claim.computed === true;
    case "observed":
    case "inferred":
    case "firstParty":
      return sources >= 1;
    case "hypothesis":
      // An idea to test is never presented as a computed figure.
      return claim.computed !== true;
    case "insufficient":
      return sources === 0 && claim.computed !== true;
    default:
      return false;
  }
}

/** Claims whose shape breaks their basis rule. */
export function claimsWithoutEvidence(claims: ClaimInput[]): string[] {
  return claims.filter((claim) => !shapeHolds(claim)).map((claim) => claim.claimKey);
}

export function assertClaims(claims: ClaimInput[]) {
  if (claimsWithoutEvidence(claims).length > 0) throw new Error("A claim needs evidence.");
}

/**
 * Claims whose cited sources do not hold up: a made-up id like "none", a record from another
 * workspace or since deleted, or, for a firstParty claim, a source that is not the business's own.
 * A claim that cites nothing and needs nothing (hypothesis, insufficient, older computed) passes.
 */
export async function claimsWithMissingSources(
  ctx: { db: GenericDatabaseReader<DataModel> },
  workspaceId: Id<"workspaces">,
  claims: Pick<ClaimInput, "claimKey" | "basis" | "sourceIds" | "sourceId" | "computed">[],
): Promise<string[]> {
  const missing: string[] = [];
  for (const claim of claims) {
    const sources = citedSources(claim);
    const needsSource = claim.basis === "observed" || claim.basis === "inferred" || claim.basis === "firstParty";
    const legacyNeedsSource = claim.basis === undefined && claim.computed !== true;
    if (sources.length === 0) {
      if (needsSource || legacyNeedsSource) missing.push(claim.claimKey);
      continue;
    }
    for (const sourceId of sources) {
      const table = await sourceTable(ctx, workspaceId, sourceId);
      if (!table || (claim.basis === "firstParty" && !FIRST_PARTY_TABLES.has(table))) {
        missing.push(claim.claimKey);
        break;
      }
    }
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

/** The table a source id belongs to, when it is a real record in this workspace. */
async function sourceTable(ctx: { db: GenericDatabaseReader<DataModel> }, workspaceId: Id<"workspaces">, sourceId: string) {
  for (const table of SOURCE_TABLES) {
    const id = ctx.db.normalizeId(table, sourceId);
    if (!id) continue;
    const row = await ctx.db.get(id);
    return row !== null && row.workspaceId === workspaceId ? table : null;
  }
  return null;
}
