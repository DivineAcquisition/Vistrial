import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PermissionError, roleHas } from "@/lib/team/permissions";
import { isPasswordAcceptable, passwordStrength } from "@/lib/team/password";
import { orderedPair } from "@/lib/territory/conflict";

describe("team roles", () => {
  it("gives Members operational access only", () => {
    assert.equal(roleHas("member", "operational"), true);
    assert.equal(roleHas("member", "manage_users"), false);
    assert.equal(roleHas("member", "manage_commercial"), false);
    assert.equal(roleHas("member", "manage_definitions"), false);
    assert.equal(roleHas("member", "manage_charges"), false);
    assert.equal(roleHas("member", "delete"), false);
  });

  it("keeps Owner-only powers off Admin", () => {
    assert.equal(roleHas("admin", "manage_users"), true);
    assert.equal(roleHas("admin", "change_owner_role"), false);
    assert.equal(roleHas("admin", "deactivate_owner"), false);
    assert.equal(roleHas("admin", "integration_secrets"), false);
    assert.equal(roleHas("admin", "territory_override"), false);
  });

  it("gives Owners the full catalogue", () => {
    assert.equal(roleHas("owner", "integration_secrets"), true);
    assert.equal(roleHas("owner", "territory_override"), true);
    assert.equal(roleHas("owner", "change_owner_role"), true);
  });

  it("PermissionError is identifiable", () => {
    const error = new PermissionError();
    assert.equal(error.code, "permission_denied");
  });
});

describe("team password rules", () => {
  it("requires twelve characters", () => {
    assert.equal(isPasswordAcceptable("short"), false);
    assert.equal(isPasswordAcceptable("long-enough-12"), true);
  });

  it("reports strength while typing", () => {
    const weak = passwordStrength("aaaaaaaaaaaa");
    assert.equal(weak.level === "weak" || weak.level === "fair", true);
    const strong = passwordStrength("Correct-Horse-Battery-99!");
    assert.equal(strong.level, "strong");
  });
});

describe("owner invariant helper shape", () => {
  it("orders pairs stably for override-style keys", () => {
    const [a, b] = orderedPair(
      "00000000-0000-0000-0000-000000000002",
      "00000000-0000-0000-0000-000000000001"
    );
    assert.equal(a < b, true);
  });
});
