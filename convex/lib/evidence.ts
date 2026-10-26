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
