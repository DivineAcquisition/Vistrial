import { describe, expect, it } from "vitest";

import { TRUST_FALLBACK } from "@/lib/trust/model";
import { termsText } from "@/lib/trust/terms-of-service";

const text = termsText(TRUST_FALLBACK);

describe("terms stay inside the billing system", () => {
  it("uses the filled operator, address, and dates", () => {
    expect(text).toContain("Vistrial LLC, operated by DivineAcquisition LLC");
    expect(text).toContain("7404 Executive Place, Lanham, MD 20706");
    expect(text).toContain("Last updated: October 15, 2026");
    expect(text).toContain("Effective: November 1, 2026");
    expect(text).toContain("contact@vistrial.io");
    expect(text).not.toContain("\u2014");
    expect(text).not.toMatch(/apply this/i);
  });

  it("does not promise the unpaid-account day count", () => {
    expect(text).toContain("keeps working");
    expect(text).not.toMatch(/from day 8: your workspace is restricted/i);
    expect(text).toContain("not what the billing system does");
    expect(text).toMatch(/six \(6\) months/i);
    expect(text).toContain("$97");
    expect(text).toContain("Prince George's County");
    expect(text).toContain("[COUNSEL:");
    expect(text).not.toMatch(/legal@divineacquisition/i);
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
