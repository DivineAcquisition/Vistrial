import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cookieNameForSurface,
  hostSurface,
  isClientPath,
  isStaffPath,
  pathAllowedOnHost,
} from "@/lib/hosts";

describe("hostname surfaces", () => {
  it("maps production hosts", () => {
    assert.equal(hostSurface("admin.vistrial.io"), "staff");
    assert.equal(hostSurface("app.vistrial.io"), "client");
    assert.equal(hostSurface("Admin.Vistrial.io:443"), "staff");
    assert.equal(hostSurface("evil.vistrial.io"), "unknown");
    assert.equal(hostSurface("localhost:3000"), "local");
  });

  it("classifies client and staff paths without restructuring routes", () => {
    assert.equal(isClientPath("/portal"), true);
    assert.equal(isClientPath("/portal/billing"), true);
    assert.equal(isClientPath("/invite/abc"), true);
    assert.equal(isClientPath("/share/abc"), true);
    assert.equal(isClientPath("/login"), false);
    assert.equal(isStaffPath("/attention"), true);
    assert.equal(isStaffPath("/portal"), false);
    assert.equal(isStaffPath("/"), false);
  });

  it("returns not-allowed across hosts (middleware turns these into 404)", () => {
    assert.equal(pathAllowedOnHost("client", "/attention"), false);
    assert.equal(pathAllowedOnHost("client", "/login"), false);
    assert.equal(pathAllowedOnHost("staff", "/portal"), false);
    assert.equal(pathAllowedOnHost("staff", "/invite/x"), false);
    assert.equal(pathAllowedOnHost("staff", "/share/x"), false);
    assert.equal(pathAllowedOnHost("unknown", "/portal"), false);
    assert.equal(pathAllowedOnHost("local", "/portal"), true);
    assert.equal(pathAllowedOnHost("local", "/attention"), true);
  });

  it("uses distinct cookie names per surface and never a parent domain", () => {
    assert.equal(cookieNameForSurface("staff"), "sb-vistrial-staff-auth");
    assert.equal(cookieNameForSurface("client"), "sb-vistrial-client-auth");
    assert.notEqual(
      cookieNameForSurface("staff"),
      cookieNameForSurface("client")
    );
  });
});
