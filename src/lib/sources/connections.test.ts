import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { unavailableReason } from "@/lib/sources/connections";

describe("unconnected source copy", () => {
  it("says credentials are missing instead of implying a zero", () => {
    expect(unavailableReason("meta_ads", false)).toContain("not configured");
    expect(unavailableReason("google_ads", false)).toContain("not configured");
    expect(unavailableReason("stripe", false)).toContain("not configured");
    expect(unavailableReason("calendar", false)).toContain("unavailable");
  });

  it("is silent when a connect path exists", () => {
    expect(unavailableReason("commas", false)).toBe("");
    expect(unavailableReason("form_platform", false)).toBe("");
  });
});

describe("source connection card client boundary", () => {
  it("does not import server modules that name encryption secrets", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/sources/source-connection-card.tsx"),
      "utf8"
    );
    expect(source).not.toMatch(/@\/lib\/sources\/connections/);
    expect(source).not.toMatch(/@\/lib\/sources\/env/);
    expect(source).not.toMatch(/@\/lib\/ghl\/crypto/);
    expect(source).not.toMatch(/@\/lib\/ghl\/env/);
    expect(source).not.toMatch(/GHL_CLIENT_SECRET/);
    expect(source).not.toMatch(/GHL_TOKEN_ENCRYPTION_KEY/);
  });
});
