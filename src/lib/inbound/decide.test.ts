import { describe, expect, it } from "vitest";

import { boundedPayload, decideInbound, MAX_HELD_PAYLOAD_BYTES } from "@/lib/inbound/decide";

describe("decideInbound", () => {
  it("accepts exactly one open workspace", () => {
    expect(decideInbound({ candidates: [{ id: "a", status: "active" }] })).toEqual({ action: "accept", orgId: "a" });
    expect(decideInbound({ candidates: [{ id: "a", status: "onboarding" }] })).toEqual({ action: "accept", orgId: "a" });
  });

  it("holds an event that matches no workspace", () => {
    expect(decideInbound({ candidates: [] })).toEqual({ action: "hold", reason: "unmatched", orgId: null });
  });

  it("holds an event that matches more than one workspace", () => {
    expect(
      decideInbound({ candidates: [{ id: "a", status: "active" }, { id: "b", status: "active" }] })
    ).toEqual({ action: "hold", reason: "ambiguous", orgId: null });
  });

  it("treats the same workspace twice as one match", () => {
    expect(
      decideInbound({ candidates: [{ id: "a", status: "active" }, { id: "a", status: "active" }] })
    ).toEqual({ action: "accept", orgId: "a" });
  });

  it("holds events for paused and closed workspaces", () => {
    expect(decideInbound({ candidates: [{ id: "a", status: "paused" }] })).toEqual({
      action: "hold",
      reason: "workspace_paused",
      orgId: "a",
    });
    expect(decideInbound({ candidates: [{ id: "a", status: "closed" }] })).toEqual({
      action: "hold",
      reason: "workspace_closed",
      orgId: "a",
    });
  });

  it("holds everything from a source that is not plugged in, even when it matches", () => {
    expect(decideInbound({ candidates: [{ id: "a", status: "active" }], sourceEnabled: false })).toEqual({
      action: "hold",
      reason: "source_not_enabled",
      orgId: "a",
    });
    expect(decideInbound({ candidates: [], sourceEnabled: false })).toMatchObject({ reason: "source_not_enabled" });
  });
});

describe("boundedPayload", () => {
  it("keeps small payloads and truncates large ones", () => {
    expect(boundedPayload({ a: 1 })).toEqual({ a: 1 });
    const big = boundedPayload({ blob: "x".repeat(MAX_HELD_PAYLOAD_BYTES * 2) }) as { truncated: boolean };
    expect(big.truncated).toBe(true);
  });
});
