/**
 * Sharp appointment-volume drop while a peer in the same category and a nearby
 * territory is active — the observable symptom of auction competition.
 *
 * Heuristic only: last 14 days vs prior 14 days, drop of at least 50% from a
 * prior baseline of at least 3 appointments, with a same-category peer whose
 * radius territory is nearby (or who shares postal/region codes).
 */

import { radiiNearby } from "@/lib/territory/geo";
import type { Territory } from "@/types/database";

export type VolumeWindow = {
  clientId: string;
  recent: number;
  prior: number;
};

export function volumeDroppedSharply(window: VolumeWindow): boolean {
  if (window.prior < 3) return false;
  return window.recent <= window.prior * 0.5;
}

export function peerNearby(
  ours: Territory[],
  theirs: Territory[]
): boolean {
  for (const a of ours) {
    for (const b of theirs) {
      if (a.kind === "radius" && b.kind === "radius") {
        if (
          a.center_lat == null ||
          a.center_lng == null ||
          a.radius_miles == null ||
          b.center_lat == null ||
          b.center_lng == null ||
          b.radius_miles == null
        ) {
          continue;
        }
        if (
          radiiNearby(
            {
              lat: a.center_lat,
              lng: a.center_lng,
              radiusMiles: Number(a.radius_miles),
            },
            {
              lat: b.center_lat,
              lng: b.center_lng,
              radiusMiles: Number(b.radius_miles),
            }
          )
        ) {
          return true;
        }
      }

      if (a.kind === "postal_codes" && b.kind === "postal_codes") {
        const set = new Set((a.postal_codes ?? []).map((code) => code.toUpperCase()));
        if ((b.postal_codes ?? []).some((code) => set.has(code.toUpperCase()))) {
          return true;
        }
      }

      if (a.kind === "named_regions" && b.kind === "named_regions") {
        const set = new Set(
          (a.region_names ?? []).map((name) => name.trim().toLowerCase())
        );
        if (
          (b.region_names ?? []).some((name) =>
            set.has(name.trim().toLowerCase())
          )
        ) {
          return true;
        }
      }

      // Mixed types: treat as nearby enough to surface. Gap: no shared geometry.
      if (a.kind !== b.kind) return true;
    }
  }

  return false;
}
