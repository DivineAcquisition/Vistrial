import type { GenericDatabaseReader } from "convex/server";

import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { Basis } from "./researchShapes";
import { userError } from "./errors";

export type ClaimInput = {
  claimKey: string;
  statement: string;
  /** Older claims: a profile, profile example or run record. Claims with a basis cite `sourceRefIds` instead. */
  sourceId?: string;
  fetchedAt?: number;
  /** The numbers or dates in the claim were computed in code over the cited sources. */
  computed?: boolean;
  basis?: Basis;
  sourceRefIds?: string[];
};

/** Same words as the asset page, so a refused approval reads the same as the disabled button. */
export const MISSING_SOURCE = "A claim has no source, so it cannot be approved yet.";

/** How each basis reads to a person. Set here, never by the model, so an inference is always labeled one. */
export const BASIS_LABEL: Record<Basis, string> = {
  observed: "Observed",
  inferred: "Inference",
  hypothesis: "Untested hypothesis",
  firstParty: "Your data",
  insufficient: "Not enough data",
};

/** An "insufficient" line says what is missing and nothing more. It must start with these words. */
export const INSUFFICIENT_PREFIX = "Not enough data";

export type ClaimProblem =
  | "no_evidence"
  | "source_not_found"
  | "observed_needs_source"
  | "inferred_needs_source"
  | "first_party_needs_customer_data"
  | "hypothesis_cannot_be_computed"
  | "insufficient_carries_no_claim"
  | "basis_uses_source_refs";

/** Plain words for each problem, for a person who edits a claim. */
export const CLAIM_PROBLEM_TEXT: Record<ClaimProblem, string> = {
  no_evidence: "A claim needs evidence.",
  source_not_found: "A claim cites a source that is not in this workspace.",
  observed_needs_source: "An observed claim needs at least one source.",
  inferred_needs_source: "An inference needs at least one supporting source.",
  first_party_needs_customer_data: "A claim from your data needs a customer data source.",
  hypothesis_cannot_be_computed: "A hypothesis is untested, so it cannot be marked computed.",
  insufficient_carries_no_claim: "A \"Not enough data\" line cannot make a claim or cite sources.",
  basis_uses_source_refs: "A claim with a basis cites collected sources, not a profile or run record.",
};

/** The rules that need no database: what each basis must carry. Null when the shape is right. */
export function shapeProblem(claim: ClaimInput): ClaimProblem | null {
  const refs = claim.sourceRefIds ?? [];
  if (claim.basis === undefined) {
    // Claims from before bases: a source and a fetch time, or the computed flag.
    if (refs.length > 0) return "no_evidence";
    const sourced = Boolean(claim.sourceId && claim.fetchedAt);
    return sourced || claim.computed === true ? null : "no_evidence";
  }
  if (claim.sourceId !== undefined) return "basis_uses_source_refs";
  switch (claim.basis) {
    case "observed":
      return refs.length > 0 ? null : "observed_needs_source";
    case "inferred":
      return refs.length > 0 ? null : "inferred_needs_source";
    case "firstParty":
      return refs.length > 0 ? null : "first_party_needs_customer_data";
    case "hypothesis":
      return claim.computed === true ? "hypothesis_cannot_be_computed" : null;
    case "insufficient":
      if (refs.length > 0 || claim.computed === true) return "insufficient_carries_no_claim";
      return claim.statement.trim().startsWith(INSUFFICIENT_PREFIX) ? null : "insufficient_carries_no_claim";
  }
}

/** Keys of claims whose shape breaks a rule. */
export function claimsWithoutEvidence(claims: ClaimInput[]): string[] {
  return claims.filter((claim) => shapeProblem(claim) !== null).map((claim) => claim.claimKey);
}

export function assertClaims(claims: ClaimInput[]) {
  for (const claim of claims) {
    const problem = shapeProblem(claim);
    if (problem) throw userError(CLAIM_PROBLEM_TEXT[problem]);
  }
}

type Reader = { db: GenericDatabaseReader<DataModel> };

/** Records an older claim may cite. Each one carries the workspace it belongs to. */
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

/** The cited source references that exist in this workspace. Ids from elsewhere, or made up, are left out. */
export async function sourceRefsInWorkspace(ctx: Reader, workspaceId: Id<"workspaces">, ids: string[]) {
  const found: Doc<"sourceRefs">[] = [];
  for (const raw of ids) {
    const id = ctx.db.normalizeId("sourceRefs", raw);
    const row = id ? await ctx.db.get(id) : null;
    if (row && row.workspaceId === workspaceId) found.push(row);
  }
  return found;
}

/** Every rule, including the ones that read the database. Null when the claim may stand. */
export async function claimProblem(ctx: Reader, workspaceId: Id<"workspaces">, claim: ClaimInput): Promise<ClaimProblem | null> {
  const shape = shapeProblem(claim);
  if (shape) return shape;
  if (claim.basis === undefined) {
    if (claim.computed === true && !claim.sourceId) return null;
    return (await findSource(ctx, workspaceId, claim.sourceId ?? "")) ? null : "source_not_found";
  }
  const ids = claim.sourceRefIds ?? [];
  if (ids.length === 0) return null;
  const refs = await sourceRefsInWorkspace(ctx, workspaceId, ids);
  // Every cited reference must be real and in this workspace, not just one of them.
  if (refs.length !== ids.length) return "source_not_found";
  if (claim.basis === "firstParty" && !refs.some((ref) => ref.platform === "customerData")) {
    return "first_party_needs_customer_data";
  }
  return null;
}

/**
 * Splits claims into those that may stand and those that break a rule, with the reason. The report
 * writer uses this to drop a bad claim instead of failing the whole report.
 */
export async function screenClaims<C extends ClaimInput>(ctx: Reader, workspaceId: Id<"workspaces">, claims: C[]) {
  const kept: C[] = [];
  const dropped: { claimKey: string; problem: ClaimProblem }[] = [];
  for (const claim of claims) {
    const problem = await claimProblem(ctx, workspaceId, claim);
    if (problem) dropped.push({ claimKey: claim.claimKey, problem });
    else kept.push(claim);
  }
  return { kept, dropped };
}

/**
 * Claims that cannot stand on the evidence in the workspace: a made-up id like "none", a record from
 * another workspace, one that has since been deleted, or a basis whose rule is not met.
 */
export async function claimsWithMissingSources(ctx: Reader, workspaceId: Id<"workspaces">, claims: ClaimInput[]): Promise<string[]> {
  return (await screenClaims(ctx, workspaceId, claims)).dropped.map((row) => row.claimKey);
}

/** Refuses the first claim that breaks a rule, in plain words. */
export async function assertSourcesExist(ctx: Reader, workspaceId: Id<"workspaces">, claims: ClaimInput[]) {
  for (const claim of claims) {
    const problem = await claimProblem(ctx, workspaceId, claim);
    if (problem) throw userError(problem === "source_not_found" ? "A claim needs evidence." : CLAIM_PROBLEM_TEXT[problem]);
  }
}

/** Evidence rows read back as claims, so a stored version is checked by the same rules. */
export function claimFromRow(row: Doc<"evidence">): ClaimInput {
  return {
    claimKey: row.claimKey,
    statement: row.statement ?? "",
    sourceId: row.sourceId,
    fetchedAt: row.fetchedAt,
    computed: row.computed,
    basis: row.basis,
    sourceRefIds: row.sourceRefIds,
  };
}
