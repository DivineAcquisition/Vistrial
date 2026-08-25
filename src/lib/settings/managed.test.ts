import { describe, expect, it } from "vitest";

import { canWriteAdvancedSettings, canWriteWorkspaceSettings } from "@/lib/settings/managed";
import type { AuthContext } from "@/lib/auth/types";

function ctx(role: AuthContext["role"], isPlatformAdmin = false): AuthContext {
  return {
    role,
    isPlatformAdmin,
    user: { id: "u" } as AuthContext["user"],
    member: {
      id: "m",
      orgId: "o",
      role,
      displayName: "Pat",
      email: "pat@example.com",
      org: { id: "o", name: "Org", slug: "org", timezone: "UTC", ghlLocationId: null },
    },
    org: { id: "o", name: "Org", slug: "org", timezone: "UTC", ghlLocationId: null },
    memberships: [],
    cookieNeedsReset: false,
  };
}

describe("managed write gates", () => {
  it("lets an owner change workspace settings while Advanced stays locked", () => {
    const owner = ctx("owner");
    expect(canWriteWorkspaceSettings(owner)).toBe(true);
    expect(canWriteAdvancedSettings(owner, true)).toBe(false);
    expect(canWriteAdvancedSettings(owner, false)).toBe(true);
  });

  it("lets DA staff write Advanced on a managed org", () => {
    expect(canWriteAdvancedSettings(ctx("setter", true), true)).toBe(true);
  });

  it("rejects a setter for both workspace and advanced writes", () => {
    const setter = ctx("setter");
    expect(canWriteWorkspaceSettings(setter)).toBe(false);
    expect(canWriteAdvancedSettings(setter, false)).toBe(false);
  });
});
