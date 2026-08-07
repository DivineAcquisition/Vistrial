/**
 * Conflict detection for exclusivity.
 *
 * A conflict exists where another active client shares at least one service
 * category and has any territory overlap. Where a precise comparison is not
 * possible, the result is a possible conflict rather than an assertion of none.
 */

import {
  normalizePostal,
  normalizeRegion,
  postalCodesOverlap,
  radiiOverlap,
  regionsOverlap,
  type LatLng,
} from "@/lib/territory/geo";

export type TerritoryKind = "radius" | "postal_codes" | "named_regions";

export type TerritoryInput = {
  id?: string;
  kind: TerritoryKind;
  label?: string | null;
  centerLat?: number | null;
  centerLng?: number | null;
  radiusMiles?: number | null;
  postalCodes?: string[];
  regionNames?: string[];
};

export type ConflictCertainty = "definite" | "possible";

export type TerritoryOverlap =
  | { overlaps: false }
  | {
      overlaps: true;
      certainty: ConflictCertainty;
      nature: string;
    };

export type ClientConflict = {
  otherClientId: string;
  otherClientName: string;
  sharedCategoryIds: string[];
  sharedCategoryNames: string[];
  certainty: ConflictCertainty;
  nature: string;
};

export function compareTerritories(
  a: TerritoryInput,
  b: TerritoryInput
): TerritoryOverlap {
  if (a.kind === "radius" && b.kind === "radius") {
    if (
      a.centerLat == null ||
      a.centerLng == null ||
      a.radiusMiles == null ||
      b.centerLat == null ||
      b.centerLng == null ||
      b.radiusMiles == null
    ) {
      return {
        overlaps: true,
        certainty: "possible",
        nature: "Radius territories could not be compared precisely (missing center or radius).",
      };
    }

    const left: LatLng & { radiusMiles: number } = {
      lat: a.centerLat,
      lng: a.centerLng,
      radiusMiles: Number(a.radiusMiles),
    };
    const right: LatLng & { radiusMiles: number } = {
      lat: b.centerLat,
      lng: b.centerLng,
      radiusMiles: Number(b.radiusMiles),
    };

    if (!radiiOverlap(left, right)) return { overlaps: false };

    return {
      overlaps: true,
      certainty: "definite",
      nature: `Radius territories overlap (centers within combined ${
        left.radiusMiles + right.radiusMiles
      } mi).`,
    };
  }

  if (a.kind === "postal_codes" && b.kind === "postal_codes") {
    const left = (a.postalCodes ?? []).map(normalizePostal);
    const right = (b.postalCodes ?? []).map(normalizePostal);
    if (!postalCodesOverlap(left, right)) return { overlaps: false };
    const shared = left.filter((code) => right.includes(code));
    return {
      overlaps: true,
      certainty: "definite",
      nature: `Shared postal codes: ${shared.slice(0, 8).join(", ")}${
        shared.length > 8 ? "…" : ""
      }.`,
    };
  }

  if (a.kind === "named_regions" && b.kind === "named_regions") {
    const left = a.regionNames ?? [];
    const right = b.regionNames ?? [];
    if (!regionsOverlap(left, right)) return { overlaps: false };
    const shared = left
      .map(normalizeRegion)
      .filter((name) => right.map(normalizeRegion).includes(name));
    return {
      overlaps: true,
      certainty: "definite",
      nature: `Shared regions: ${shared.slice(0, 6).join(", ")}.`,
    };
  }

  // Mixed types cannot be compared precisely without resolving both to the
  // same geometry. Prefer a possible conflict over a false all-clear.
  // Gap: resolving radius/region territories to postal codes needs a boundary
  // dataset that is not wired in yet.
  return {
    overlaps: true,
    certainty: "possible",
    nature: `Mixed territory types (${a.kind} vs ${b.kind}) cannot be compared precisely — treat as a possible overlap.`,
  };
}

export function findConflicts(input: {
  clientId: string | null;
  categoryIds: string[];
  categoryNamesById: Map<string, string>;
  territories: TerritoryInput[];
  others: {
    id: string;
    name: string;
    categoryIds: string[];
    territories: TerritoryInput[];
    /** Existing override between this pair suppresses the conflict. */
    overridden?: boolean;
  }[];
}): ClientConflict[] {
  if (input.categoryIds.length === 0 || input.territories.length === 0) {
    return [];
  }

  const conflicts: ClientConflict[] = [];

  for (const other of input.others) {
    if (input.clientId !== null && other.id === input.clientId) continue;
    if (other.overridden) continue;

    const shared = input.categoryIds.filter((id) => other.categoryIds.includes(id));
    if (shared.length === 0) continue;

    let best: TerritoryOverlap | null = null;

    for (const ours of input.territories) {
      for (const theirs of other.territories) {
        const result = compareTerritories(ours, theirs);
        if (!result.overlaps) continue;
        if (
          best === null ||
          !best.overlaps ||
          (result.certainty === "definite" && best.certainty === "possible")
        ) {
          best = result;
        }
      }
    }

    if (best === null || !best.overlaps) continue;

    conflicts.push({
      otherClientId: other.id,
      otherClientName: other.name,
      sharedCategoryIds: shared,
      sharedCategoryNames: shared.map(
        (id) => input.categoryNamesById.get(id) ?? id
      ),
      certainty: best.certainty,
      nature: best.nature,
    });
  }

  return conflicts;
}

/** Stable pair ordering for override / match rows. */
export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}
