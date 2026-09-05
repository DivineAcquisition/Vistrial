import { describe, expect, it } from "vitest";

import { canManageMembers, removesLastActiveOwner } from "@/lib/auth/permissions";

describe("canManageMembers", () => {
  it("is owner and admin only", () => {
    expect(canManageMembers("owner")).toBe(true);
    expect(canManageMembers("admin")).toBe(true);
    expect(canManageMembers("setter")).toBe(false);
    expect(canManageMembers("closer")).toBe(false);
  });

  it("lets a platform admin through whatever their org role", () => {
    expect(canManageMembers("setter", true)).toBe(true);
  });
});

describe("removesLastActiveOwner", () => {
  const soleOwner = {
    role: "owner",
    active: true,
    activeOwners: 1,
  } as const;

  it("blocks the sole owner from demoting themselves", () => {
    expect(
      removesLastActiveOwner({ ...soleOwner, nextRole: "admin", nextActive: true })
    ).toBe(true);
  });

  it("blocks the sole owner from deactivating themselves", () => {
    expect(
      removesLastActiveOwner({ ...soleOwner, nextRole: "owner", nextActive: false })
    ).toBe(true);
  });

  it("allows an owner to step down once a second owner is active", () => {
    expect(
      removesLastActiveOwner({
        role: "owner",
        active: true,
        nextRole: "admin",
        nextActive: true,
        activeOwners: 2,
      })
    ).toBe(false);
  });

  it("allows edits that keep the member an active owner", () => {
    expect(
      removesLastActiveOwner({ ...soleOwner, nextRole: "owner", nextActive: true })
    ).toBe(false);
  });

  it("does not block members who were not active owners to begin with", () => {
    expect(
      removesLastActiveOwner({
        role: "admin",
        active: true,
        nextRole: "setter",
        nextActive: false,
        activeOwners: 1,
      })
    ).toBe(false);
    expect(
      removesLastActiveOwner({
        role: "owner",
        active: false,
        nextRole: "setter",
        nextActive: false,
        activeOwners: 1,
      })
    ).toBe(false);
  });

  // The count comes from a query that can fail. Failing open would strand the
  // org with nobody able to grant the owner role back.
  it("blocks when the owner count could not be read", () => {
    expect(
      removesLastActiveOwner({
        role: "owner",
        active: true,
        nextRole: "admin",
        nextActive: true,
        activeOwners: Number.NaN,
      })
    ).toBe(true);
  });
});
