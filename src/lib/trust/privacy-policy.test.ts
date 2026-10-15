import { describe, expect, it } from "vitest";

import { TRUST_FALLBACK } from "@/lib/trust/model";
import { privacyPolicyText } from "@/lib/trust/privacy-policy";
import { requestAgeDays, requestNeedsAttention } from "@/lib/trust/request-age";

const text = privacyPolicyText(TRUST_FALLBACK);

describe("privacy policy stays inside verified behavior", () => {
  it("names the operator and the Lanham address", () => {
    expect(text).toContain("Divine Agency LLC");
    expect(text).toContain("7404 Executive Place, Lanham, MD 20706");
    expect(text).toContain("Effective: Not in effect");
    expect(text).toContain("Last updated: October 15, 2026");
  });

  it("drops claims the product does not enforce", () => {
    expect(text).not.toContain("\u2014");
    expect(text).not.toMatch(/openai/i);
    expect(text).not.toMatch(/vercel analytics/i);
    expect(text).not.toMatch(/last four/i);
    expect(text).not.toMatch(/seven years/i);
    expect(text).not.toMatch(/two years/i);
    expect(text).toContain("14 days");
    expect(text).toContain("does not delete all raw imported data after 7 days");
    expect(text).not.toMatch(/train/i);
    expect(text).not.toMatch(/at rest/i);
    expect(text).toContain("Global Privacy Control");
    expect(text).toContain("Meta pixel");
    expect(text).not.toContain("[COUNSEL:");
    expect(text).toContain("US East, N. Virginia");
  });

  it("adds a switch line only when that switch is on", () => {
    const on = privacyPolicyText({
      ...TRUST_FALLBACK,
      privacyLive: true,
      mailingAddress: "Registered agent, Maryland",
      switches: { ...TRUST_FALLBACK.switches, aiNoTraining: true, encryptionAtRest: true },
    });
    expect(on).toMatch(/not used to train/i);
    expect(on).toMatch(/encrypted at rest/i);
    expect(on).toContain("Effective: October 15, 2026");
    expect(on).toContain("Registered agent, Maryland");
  });
});

describe("data request age", () => {
  const now = new Date("2026-10-15T12:00:00Z");

  it("flags an open request once it is 30 days old", () => {
    expect(requestAgeDays("2026-09-15T12:00:00Z", now)).toBe(30);
    expect(requestNeedsAttention("received", "2026-09-15T12:00:00Z", now)).toBe(true);
    expect(requestNeedsAttention("received", "2026-10-01T12:00:00Z", now)).toBe(false);
    expect(requestNeedsAttention("completed", "2026-08-01T12:00:00Z", now)).toBe(false);
  });
});
