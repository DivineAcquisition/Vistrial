import { describe, expect, it } from "vitest";

import { TRUST_FALLBACK } from "@/lib/trust/model";
import { privacyPolicyText } from "@/lib/trust/privacy-policy";
import { requestAgeDays, requestNeedsAttention } from "@/lib/trust/request-age";

const text = privacyPolicyText(TRUST_FALLBACK);

describe("privacy policy stays inside verified behavior", () => {
  it("names the operator and the Lanham address", () => {
    expect(text).toContain("Divine Agency LLC");
    expect(text).toContain("7404 Executive Place, Lanham, MD 20706");
    expect(text).toContain("Effective: November 5, 2026");
    expect(text).toContain("Last updated: November 5, 2026");
  });

  it("drops claims the product does not enforce", () => {
    expect(text).not.toContain("\u2014");
    expect(text).not.toMatch(/openai/i);
    expect(text).not.toMatch(/vercel analytics/i);
    expect(text).not.toMatch(/last four/i);
    expect(text).not.toMatch(/seven years/i);
    expect(text).not.toMatch(/two years/i);
    // Retention: only what the product does today. No invented deletion schedules.
    expect(text).toContain("does not currently delete workspace information on an automatic schedule");
    expect(text).not.toMatch(/after 12 months|after 14 days|365 days|after 90 days/i);
    expect(text).not.toMatch(/train/i);
    expect(text).not.toMatch(/at rest/i);
    expect(text).toContain("Global Privacy Control");
    expect(text).toContain("Meta pixel");
    expect(text).not.toContain("[COUNSEL:");
    // The policy names the providers the code actually calls, and no retired ones.
    for (const name of ["Vercel", "Convex", "Clerk", "Anthropic", "Cloudflare"]) expect(text).toContain(name);
    expect(text).not.toMatch(/stripe|supabase|compass|quiet hours|embeddings/i);
    expect(text).not.toMatch(/GoHighLevel is the CRM/i);
  });

  it("describes the current product and its research rules", () => {
    expect(text).toContain("Growth Architect");
    expect(text).toContain("official access only");
    expect(text).toContain("does not store copies of ad images or video files");
    expect(text).toContain("We do not currently use Google Analytics or the Meta pixel");
  });

  it("shows Not in effect while the policy is switched off", () => {
    expect(privacyPolicyText({ ...TRUST_FALLBACK, privacyLive: false })).toContain("Effective: Not in effect");
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
    expect(on).toContain("Effective: November 5, 2026");
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
