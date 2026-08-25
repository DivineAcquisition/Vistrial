import { describe, expect, it } from "vitest";

import { classifyAuthError } from "@/lib/auth/errors";
import { authCallbackUrl, pathRefreshesAuthSession, postAuthPath } from "@/lib/auth/paths";
import { PRODUCTION_APP_ORIGIN } from "@/lib/constants";
import { isAllowedAppOrigin, originFromForwardedHost, resolveAppUrl } from "@/lib/app-url";

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

describe("request origin allowlist", () => {
  it("accepts the production app host and local dev", () => {
    expect(isAllowedAppOrigin(PRODUCTION_APP_ORIGIN)).toBe(true);
    expect(isAllowedAppOrigin("http://localhost:3000")).toBe(true);
    expect(isAllowedAppOrigin("https://evil.example")).toBe(false);
  });

  it("builds an origin from forwarded host only when it is allowed", () => {
    expect(
      originFromForwardedHost({ host: "app.vistrial.io", proto: "https" })
    ).toBe(PRODUCTION_APP_ORIGIN);
    expect(originFromForwardedHost({ host: "evil.example", proto: "https" })).toBeNull();
  });
});

describe("auth callback URL", () => {
  it("pins magic-link redirects to an explicit origin", () => {
    expect(authCallbackUrl("/app/queue", PRODUCTION_APP_ORIGIN)).toBe(
      "https://app.vistrial.io/auth/callback?next=%2Fapp%2Fqueue"
    );
  });

  it("returns invite paths after sign-in so redemption can finish", () => {
    expect(postAuthPath("/accept-invite/abc")).toBe("/accept-invite/abc");
    expect(postAuthPath("/login")).toBe("/app/queue");
  });
});

describe("pathRefreshesAuthSession", () => {
  it("refreshes on login and no-access so membership reads see the user JWT", () => {
    expect(pathRefreshesAuthSession("/login")).toBe(true);
    expect(pathRefreshesAuthSession("/no-access")).toBe(true);
    expect(pathRefreshesAuthSession("/auth/callback")).toBe(true);
    expect(pathRefreshesAuthSession("/app/queue")).toBe(true);
    expect(pathRefreshesAuthSession("/")).toBe(false);
  });
});

describe("classifyAuthError", () => {
  it("maps GoTrue invalid-credentials codes", () => {
    expect(classifyAuthError("Invalid login credentials", "invalid_credentials")).toBe(
      "credentials"
    );
  });
});
