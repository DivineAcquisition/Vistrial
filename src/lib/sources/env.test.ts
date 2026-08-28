import { describe, expect, it } from "vitest";

import { GOOGLE_ADS_READONLY_SCOPE } from "@/lib/sources/env";

describe("source scopes", () => {
  it("requests the Google Ads read-only scope, never the write-capable adwords scope", () => {
    expect(GOOGLE_ADS_READONLY_SCOPE).toBe("https://www.googleapis.com/auth/adwords.readonly");
    expect(GOOGLE_ADS_READONLY_SCOPE).not.toBe("https://www.googleapis.com/auth/adwords");
  });
});
