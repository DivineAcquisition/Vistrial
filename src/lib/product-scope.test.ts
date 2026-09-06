import { describe, expect, it } from "vitest";

import { PRODUCT_SCOPE, isProductScopeEnabled } from "@/lib/product-scope";

describe("MVP product scope", () => {
  it("parks every out-of-scope surface at compile time", () => {
    expect(PRODUCT_SCOPE.coaching).toBe(false);
    expect(PRODUCT_SCOPE.activityStream).toBe(false);
    expect(PRODUCT_SCOPE.followUpSettings).toBe(false);
    expect(PRODUCT_SCOPE.documentGeneration).toBe(false);
    expect(PRODUCT_SCOPE.forsightCreatives).toBe(false);
    expect(PRODUCT_SCOPE.forsightWeeklyPulse).toBe(false);
    expect(PRODUCT_SCOPE.extraReporting).toBe(false);
    expect(PRODUCT_SCOPE.extraPipeline).toBe(false);
    expect(PRODUCT_SCOPE.extraPortal).toBe(false);
  });

  it("keeps the helper aligned with the flag table", () => {
    expect(isProductScopeEnabled("coaching")).toBe(PRODUCT_SCOPE.coaching);
  });
});
