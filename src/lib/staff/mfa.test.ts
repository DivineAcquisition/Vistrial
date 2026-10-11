import { describe, expect, it } from "vitest";

import { evaluateRecentAuth, type AuthMethod } from "@/lib/staff/mfa";

const NOW = Date.parse("2026-10-11T15:00:00Z");
const recent = (method: string, minutesAgo = 5): AuthMethod => ({
  method,
  timestamp: Math.floor((NOW - minutesAgo * 60_000) / 1000),
});

describe("evaluateRecentAuth", () => {
  it("accepts a recent password before enforcement", () => {
    expect(
      evaluateRecentAuth({ methods: [recent("password")], enrolled: false, deadline: null, grantUntil: null, now: NOW })
    ).toBe("ok");
  });

  it("rejects a password older than 15 minutes", () => {
    expect(
      evaluateRecentAuth({ methods: [recent("password", 16)], enrolled: false, deadline: null, grantUntil: null, now: NOW })
    ).toBe("stale");
  });

  it("requires the authenticator app once it is enrolled, even during grace", () => {
    const deadline = new Date(NOW + 86_400_000).toISOString();
    expect(
      evaluateRecentAuth({ methods: [recent("password")], enrolled: true, deadline, grantUntil: null, now: NOW })
    ).toBe("needs_totp");
    expect(
      evaluateRecentAuth({ methods: [recent("totp")], enrolled: true, deadline, grantUntil: null, now: NOW })
    ).toBe("ok");
  });

  it("treats a recovery grant like a recent authenticator check", () => {
    expect(
      evaluateRecentAuth({
        methods: [],
        enrolled: true,
        deadline: null,
        grantUntil: new Date(NOW + 60_000).toISOString(),
        now: NOW,
      })
    ).toBe("ok");
  });

  it("sends someone past the grace period to enrollment", () => {
    const deadline = new Date(NOW - 1000).toISOString();
    expect(
      evaluateRecentAuth({ methods: [recent("password")], enrolled: false, deadline, grantUntil: null, now: NOW })
    ).toBe("needs_setup");
  });

  it("still accepts a password during the grace period", () => {
    const deadline = new Date(NOW + 86_400_000).toISOString();
    expect(
      evaluateRecentAuth({ methods: [recent("password")], enrolled: false, deadline, grantUntil: null, now: NOW })
    ).toBe("ok");
  });
});
