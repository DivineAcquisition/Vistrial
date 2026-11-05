import { describe, expect, it } from "vitest";

import { TRUST_FALLBACK } from "@/lib/trust/model";
import { termsText } from "@/lib/trust/terms-of-service";

const text = termsText(TRUST_FALLBACK);

describe("terms stay inside what the product does", () => {
  it("uses the filled operator, address, and dates", () => {
    expect(text).toContain("Divine Agency LLC");
    expect(text).toContain("7404 Executive Place, Lanham, MD 20706");
    expect(text).toContain("Last updated: November 5, 2026");
    expect(text).toContain("Effective: November 5, 2026");
    expect(text).toContain("contact@vistrial.io");
    expect(text).not.toContain("\u2014");
    expect(text).not.toMatch(/apply this/i);
  });

  it("keeps the commercial terms, without a billing system the product does not have", () => {
    // No payment system runs in the product today, so no Stripe and no failed-payment day schedule.
    expect(text).not.toMatch(/stripe|through day 7|from day 8|America\/New_York/i);
    expect(text).toContain("Nothing is charged on our website");
    expect(text).toMatch(/six \(6\) months/i);
    expect(text).toContain("$97");
    expect(text).toContain("Prince George's County");
    expect(text).not.toContain("[COUNSEL:");
    expect(text).not.toMatch(/legal@divineacquisition/i);
  });

  it("describes the current product, not the retired sales OS", () => {
    expect(text).toContain("Growth Architect");
    expect(text).toContain("official access only");
    expect(text).not.toMatch(/GoHighLevel is the CRM|quiet hours|case file|compass|embeddings/i);
  });

  it("adds the training line only when that switch is on", () => {
    expect(text).not.toMatch(/train/i);
    const on = termsText({
      ...TRUST_FALLBACK,
      switches: { ...TRUST_FALLBACK.switches, aiNoTraining: true },
    });
    expect(on).toMatch(/not used to train/i);
  });
});
