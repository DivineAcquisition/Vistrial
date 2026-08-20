import { describe, expect, it } from "vitest";

import { resolveAppUrl } from "@/lib/app-url";
import { PRODUCTION_APP_ORIGIN } from "@/lib/constants";

describe("resolveAppUrl", () => {
  it("uses the explicit origin when set, without a trailing slash", () => {
    expect(resolveAppUrl({ explicit: "https://app.vistrial.io/", nodeEnv: "development" })).toBe(
      PRODUCTION_APP_ORIGIN
    );
  });

  it("falls back to app.vistrial.io in production when unset", () => {
    expect(resolveAppUrl({ explicit: "", nodeEnv: "production" })).toBe(PRODUCTION_APP_ORIGIN);
  });

  it("falls back to localhost outside production when unset", () => {
    expect(resolveAppUrl({ explicit: undefined, nodeEnv: "development" })).toBe(
      "http://localhost:3000"
    );
  });
});
