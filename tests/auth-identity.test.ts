import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  authAddress,
  isAddressTaken,
  mintAuthAlias,
} from "@/lib/team/auth-identity";

describe("auth identity addressing", () => {
  it("signs in with the contact address when nothing else claims it", () => {
    assert.equal(
      authAddress({ email: "dana@example.com", auth_email: null }),
      "dana@example.com"
    );
    assert.equal(authAddress({ email: "dana@example.com" }), "dana@example.com");
  });

  it("prefers the recorded alias once one exists", () => {
    assert.equal(
      authAddress({
        email: "dana@example.com",
        auth_email: "dana+vt-team-a1b2c3@example.com",
      }),
      "dana+vt-team-a1b2c3@example.com"
    );
  });

  it("tags the alias by population and keeps the domain", () => {
    const team = mintAuthAlias("Dana@Example.com", "team");
    const portal = mintAuthAlias("dana@example.com", "portal");

    assert.match(team, /^dana\+vt-team-[0-9a-f]{6}@example\.com$/);
    assert.match(portal, /^dana\+vt-portal-[0-9a-f]{6}@example\.com$/);
    assert.notEqual(team, portal);
  });

  it("mints a fresh alias every time so a collision can be retried", () => {
    const first = mintAuthAlias("dana@example.com", "team");
    const second = mintAuthAlias("dana@example.com", "team");
    assert.notEqual(first, second);
  });

  it("keeps the local part inside the 64-octet limit", () => {
    const long = `${"d".repeat(70)}@example.com`;
    const alias = mintAuthAlias(long, "portal");
    const local = alias.slice(0, alias.lastIndexOf("@"));

    assert.ok(local.length <= 64, `local part was ${local.length} characters`);
    assert.ok(alias.endsWith("@example.com"));
  });

  it("refuses an address with no domain rather than inventing one", () => {
    assert.throws(() => mintAuthAlias("dana", "team"));
  });

  it("recognises the address-taken refusal by code and by message", () => {
    assert.equal(isAddressTaken({ code: "email_exists" }), true);
    assert.equal(
      isAddressTaken({
        message: "A user with this email address has already been registered",
      }),
      true
    );
    assert.equal(isAddressTaken({ message: "Password is too short" }), false);
    assert.equal(isAddressTaken(null), false);
  });
});
