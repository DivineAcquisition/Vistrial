import type { GenericDatabaseReader } from "convex/server";

import type { DataModel, Doc, Id } from "../_generated/dataModel";

/**
 * What supports a claim.
 * - observed: seen in at least one source reference.
 * - inferred: reasoned from at least one source reference, and always labeled as inference.
 * - hypothesis: needs no source, and is always labeled as untested.
 * - firstParty: the business's own data. Only a customer-data source reference supports it.
 * - insufficient: the "Not enough data" line. It carries no claim.
 */
export const BASES = ["observed", "inferred", "hypothesis", "firstParty", "insufficient"] as const;

export type Basis = (typeof BASES)[number];

/** The label shown next to every claim. It comes from the basis, never from the model. */
export const BASIS_LABEL: Record<Basis, string> = {
  observed: "Observed",
  inferred: "Inference",
  hypothesis: "Hypothesis, untested",
  firstParty: "Your data",
  insufficient: "Not enough data",
};

/** Every insufficient line starts with these words, so it can never read as a finding. */
export const NOT_ENOUGH_DATA = "Not enough data";

export type ClaimInput = {
  claimKey: string;
  statement: string;
  sourceId?: string;
  fetchedAt?: number;
  computed?: boolean;
  basis?: Basis;
  sourceRefIds?: string[];
};

export type ClaimProblemCode =
  | "needs_evidence"
  | "observed_needs_source"
  | "inferred_needs_source"
  | "first_party_needs_customer_data"
  | "insufficient_is_not_a_claim"
  | "source_missing";

export type ClaimProblem = { claimKey: string; code: ClaimProblemCode };

/** Same words as the asset page, so a refused approval reads the same as the disabled button. */
export const MISSING_SOURCE = "A claim has no source, so it cannot be approved yet.";

/** Rules that need no database: the basis is honest about what it carries. */
function shapeProblem(claim: ClaimInput): ClaimProblemCode | null {
  const refs = claim.sourceRefIds ?? [];
  switch (claim.basis) {
    case undefined: {
      // Claims written before the basis existed: a source and a fetch time, or an explicit computed flag.
      const sourced = Boolean(claim.sourceId && claim.fetchedAt);
      return sourced || claim.computed === true ? null : "needs_evidence";
    }
    case "observed":
      return refs.length > 0 ? null : "observed_needs_source";
    case "inferred":
      return refs.length > 0 ? null : "inferred_needs_source";
    case "firstParty":
      return refs.length > 0 ? null : "first_party_needs_customer_data";
    case "insufficient":
      return claim.statement.trim().startsWith(NOT_ENOUGH_DATA) ? null : "insufficient_is_not_a_claim";
    case "hypothesis":
      return null;
  }
}

/** Claims that break a rule that needs no database. */
export function claimsWithoutEvidence(claims: ClaimInput[]): string[] {
  return claims.filter((claim) => shapeProblem(claim) !== null).map((claim) => claim.claimKey);
}

export function assertClaims(claims: ClaimInput[]) {
  if (claimsWithoutEvidence(claims).length > 0) {
    throw new Error("A claim needs evidence.");
  }
}

type Reader = { db: GenericDatabaseReader<DataModel> };

/** Records a claim may cite through `sourceId`. Each one carries the workspace it belongs to. */
const SOURCE_TABLES = ["profileVersions", "profileExamples", "runArtifacts"] as const;

async function findSource(ctx: Reader, workspaceId: Id<"workspaces">, sourceId: string) {
  for (const table of SOURCE_TABLES) {
    const id = ctx.db.normalizeId(table, sourceId);
    if (!id) continue;
    const row = await ctx.db.get(id);
    return row !== null && row.workspaceId === workspaceId;
  }
  return false;
}

/** A source reference in this workspace, or null for a made-up id, another workspace's, or a deleted one. */
export async function findSourceRef(
  ctx: Reader,
  workspaceId: Id<"workspaces">,
  sourceRefId: string,
): Promise<Doc<"sourceRefs"> | null> {
  const id = ctx.db.normalizeId("sourceRefs", sourceRefId);
  if (!id) return null;
  const row = await ctx.db.get(id);
  return row && row.workspaceId === workspaceId ? row : null;
}

/**
 * Every rule, for every claim. A claim may fail more than one; the first is reported.
 * Every cited record must be real and in this workspace, whatever the basis: one good source does not
 * excuse a made-up one next to it.
 */
export async function claimProblems(ctx: Reader, workspaceId: Id<"workspaces">, claims: ClaimInput[]): Promise<ClaimProblem[]> {
  const problems: ClaimProblem[] = [];
  for (const claim of claims) {
    const shape = shapeProblem(claim);
    if (shape) {
      problems.push({ claimKey: claim.claimKey, code: shape });
      continue;
    }
    // A computed claim with no cited record needs nothing more. Anything it does cite must be real.
    const legacyNeedsSource = claim.basis === undefined && !(claim.computed === true && !claim.sourceId);
    if ((legacyNeedsSource || claim.sourceId) && !(await findSource(ctx, workspaceId, claim.sourceId ?? ""))) {
      problems.push({ claimKey: claim.claimKey, code: "source_missing" });
      continue;
    }
    const refs = [];
    let missing = false;
    for (const refId of claim.sourceRefIds ?? []) {
      const ref = await findSourceRef(ctx, workspaceId, refId);
      if (!ref) missing = true;
      else refs.push(ref);
    }
    if (missing) {
      problems.push({ claimKey: claim.claimKey, code: "source_missing" });
      continue;
    }
    if (claim.basis === "firstParty" && !refs.some((ref) => ref.platform === "customer")) {
      problems.push({ claimKey: claim.claimKey, code: "first_party_needs_customer_data" });
    }
  }
  return problems;
}

/**
 * Claims that cannot be approved: a cited record that is not real or not in the workspace, or a basis
 * whose rule fails. Used by the server-side approval check.
 */
export async function claimsWithMissingSources(
  ctx: Reader,
  workspaceId: Id<"workspaces">,
  claims: (Pick<ClaimInput, "claimKey" | "sourceId" | "computed" | "basis" | "sourceRefIds"> & { statement?: string })[],
): Promise<string[]> {
  // Approval re-checks sources, not fetch times: older claims stored before a fetch time was kept still count.
  const asInput = claims.map((claim) => ({
    ...claim,
    statement: claim.statement ?? "",
    fetchedAt: claim.basis === undefined && claim.sourceId ? 1 : undefined,
  }));
  return (await claimProblems(ctx, workspaceId, asInput)).map((problem) => problem.claimKey);
}

/** Throws when any claim breaks a rule. */
export async function assertSourcesExist(ctx: Reader, workspaceId: Id<"workspaces">, claims: ClaimInput[]) {
  if ((await claimProblems(ctx, workspaceId, claims)).length > 0) {
    throw new Error("A claim needs evidence.");
  }
}
