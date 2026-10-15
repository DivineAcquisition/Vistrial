import { describe, expect, it } from "vitest";

import { appliedLimit, ENTITLEMENT_KEYS, withinEntitlement } from "@/lib/billing/entitlements";

describe("entitlements", () => {
  it("registers routing and push keys with no limit until a plan sets one", () => {
    expect(ENTITLEMENT_KEYS.map((row) => row.key)).toEqual(["routing_rules", "routing_pools", "push_devices"]);
    expect(appliedLimit({}, "routing_rules")).toBeNull();
    expect(withinEntitlement(1000, appliedLimit({}, "push_devices"))).toBe(true);
    expect(appliedLimit({ push_devices: 2 }, "push_devices")).toBe(2);
    expect(withinEntitlement(2, 2)).toBe(false);
  });
});
