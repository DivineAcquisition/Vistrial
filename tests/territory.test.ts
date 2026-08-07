import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compareTerritories,
  findConflicts,
  orderedPair,
} from "@/lib/territory/conflict";
import { distanceMiles, postalCodesOverlap, radiiOverlap } from "@/lib/territory/geo";
import { peerNearby, volumeDroppedSharply } from "@/lib/territory/volume";
import { TYPE_PRIORITY } from "@/lib/attention/types";
import type { Territory } from "@/types/database";

describe("territory geometry", () => {
  it("detects overlapping radii", () => {
    assert.equal(
      radiiOverlap(
        { lat: 40, lng: -75, radiusMiles: 30 },
        { lat: 40.2, lng: -75.1, radiusMiles: 30 }
      ),
      true
    );
    assert.equal(
      radiiOverlap(
        { lat: 40, lng: -75, radiusMiles: 5 },
        { lat: 41, lng: -75, radiusMiles: 5 }
      ),
      false
    );
    assert.ok(distanceMiles({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) > 60);
  });

  it("detects shared postal codes", () => {
    assert.equal(postalCodesOverlap(["19103", "19104"], ["19104"]), true);
    assert.equal(postalCodesOverlap(["19103"], ["90210"]), false);
  });
});

describe("conflict detection", () => {
  it("finds a definite conflict on shared category and overlapping radii", () => {
    const conflicts = findConflicts({
      clientId: "new",
      categoryIds: ["roof"],
      categoryNamesById: new Map([["roof", "Roofing"]]),
      territories: [
        {
          kind: "radius",
          centerLat: 40,
          centerLng: -75,
          radiusMiles: 40,
        },
      ],
      others: [
        {
          id: "peer",
          name: "Peer Roofing",
          categoryIds: ["roof"],
          territories: [
            {
              kind: "radius",
              centerLat: 40.1,
              centerLng: -75.1,
              radiusMiles: 40,
            },
          ],
        },
      ],
    });

    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].certainty, "definite");
    assert.deepEqual(conflicts[0].sharedCategoryNames, ["Roofing"]);
  });

  it("reports a possible conflict for mixed territory types", () => {
    const result = compareTerritories(
      { kind: "radius", centerLat: 40, centerLng: -75, radiusMiles: 20 },
      { kind: "postal_codes", postalCodes: ["19103"] }
    );
    assert.equal(result.overlaps, true);
    if (result.overlaps) assert.equal(result.certainty, "possible");
  });

  it("ignores overridden peers", () => {
    const conflicts = findConflicts({
      clientId: "new",
      categoryIds: ["roof"],
      categoryNamesById: new Map([["roof", "Roofing"]]),
      territories: [
        { kind: "postal_codes", postalCodes: ["19103"] },
      ],
      others: [
        {
          id: "peer",
          name: "Peer",
          categoryIds: ["roof"],
          territories: [{ kind: "postal_codes", postalCodes: ["19103"] }],
          overridden: true,
        },
      ],
    });
    assert.equal(conflicts.length, 0);
  });

  it("orders pair ids stably", () => {
    assert.deepEqual(orderedPair("b", "a"), ["a", "b"]);
  });
});

describe("volume drop heuristic", () => {
  it("requires a prior baseline before calling a drop sharp", () => {
    assert.equal(volumeDroppedSharply({ clientId: "c", recent: 0, prior: 2 }), false);
    assert.equal(volumeDroppedSharply({ clientId: "c", recent: 1, prior: 4 }), true);
  });

  it("treats mixed territory kinds as nearby for the symptom check", () => {
    const radius = {
      id: "1",
      client_id: "a",
      kind: "radius" as const,
      label: null,
      center_lat: 40,
      center_lng: -75,
      center_address: null,
      radius_miles: 20,
      postal_codes: [],
      region_names: [],
      created_at: "",
      updated_at: "",
    } satisfies Territory;
    const postal = {
      ...radius,
      id: "2",
      client_id: "b",
      kind: "postal_codes" as const,
      center_lat: null,
      center_lng: null,
      radius_miles: null,
      postal_codes: ["19103"],
    } satisfies Territory;
    assert.equal(peerNearby([radius], [postal]), true);
  });
});

describe("attention exclusivity slotting", () => {
  it("places the three new types between disputes and pending confirmation", () => {
    assert.ok(TYPE_PRIORITY.open_dispute < TYPE_PRIORITY.cross_client_both_confirmed);
    assert.ok(
      TYPE_PRIORITY.cross_client_both_confirmed < TYPE_PRIORITY.cross_client_duplicate
    );
    assert.ok(TYPE_PRIORITY.cross_client_duplicate < TYPE_PRIORITY.volume_drop);
    assert.ok(TYPE_PRIORITY.volume_drop < TYPE_PRIORITY.pending_confirmation);
    assert.ok(TYPE_PRIORITY.pending_confirmation < TYPE_PRIORITY.awaiting_human_touch);
  });
});
