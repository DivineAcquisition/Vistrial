import { describe, expect, it } from "vitest";

import { DEV_DEPLOYMENT_URL, PRODUCTION_ISSUER, authIssuers } from "./authIssuers";

const never = () => {
  throw new Error("read");
};

describe("sign-in issuers", () => {
  it("is production Clerk only on any other deployment, without reading the dev variable", () => {
    expect(authIssuers("https://prod-deployment-123.convex.cloud", never)).toEqual([PRODUCTION_ISSUER]);
    expect(authIssuers("https://expert-stork-903.convex.cloud", never)).toEqual([PRODUCTION_ISSUER]);
    expect(authIssuers(undefined, never)).toEqual([PRODUCTION_ISSUER]);
  });

  it("adds the Clerk development instance on the dev deployment", () => {
    expect(authIssuers(DEV_DEPLOYMENT_URL, () => "https://happy-otter-12.clerk.accounts.dev/")).toEqual([
      PRODUCTION_ISSUER,
      "https://happy-otter-12.clerk.accounts.dev",
    ]);
    expect(authIssuers(DEV_DEPLOYMENT_URL, () => "none")).toEqual([PRODUCTION_ISSUER]);
  });

  it("refuses anything on dev that is not a Clerk development domain", () => {
    for (const bad of [
      "https://evil.example.com",
      "http://happy-otter-12.clerk.accounts.dev",
      "https://clerk.accounts.dev.evil.com",
      "https://happy-otter-12.clerk.accounts.dev.evil.com",
    ]) {
      expect(() => authIssuers(DEV_DEPLOYMENT_URL, () => bad)).toThrow("Clerk development domain");
    }
  });
});
