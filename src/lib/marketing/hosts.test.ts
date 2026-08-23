import { describe, expect, it } from "vitest";

import { PRODUCTION_APP_ORIGIN, PRODUCTION_SITE_ORIGIN } from "@/lib/constants";
import {
  hostnameFromHostHeader,
  isOperatorAppHost,
  resolveSiteOrigin,
  shouldRedirectToSiteHost,
} from "@/lib/marketing/hosts";

describe("isOperatorAppHost", () => {
  it("treats only the operator app host as the app", () => {
    expect(isOperatorAppHost(new URL(PRODUCTION_APP_ORIGIN).host)).toBe(true);
    expect(isOperatorAppHost("app.vistrial.io")).toBe(true);
    expect(isOperatorAppHost("vistrial.io")).toBe(false);
    expect(isOperatorAppHost("www.vistrial.io")).toBe(false);
    expect(isOperatorAppHost("localhost:3000")).toBe(false);
  });
});

describe("resolveSiteOrigin", () => {
  it("always uses vistrial.io in production", () => {
    expect(resolveSiteOrigin({ nodeEnv: "production" })).toBe(PRODUCTION_SITE_ORIGIN);
    expect(
      resolveSiteOrigin({
        explicit: "https://www.vistrial.io",
        nodeEnv: "production",
      })
    ).toBe(PRODUCTION_SITE_ORIGIN);
    expect(
      resolveSiteOrigin({
        explicit: "https://example.vercel.app",
        nodeEnv: "production",
      })
    ).toBe(PRODUCTION_SITE_ORIGIN);
  });

  it("uses localhost locally unless pointed at the real site", () => {
    expect(resolveSiteOrigin({ nodeEnv: "development" })).toBe("http://localhost:3000");
    expect(
      resolveSiteOrigin({ explicit: "http://localhost:3000", nodeEnv: "development" })
    ).toBe("http://localhost:3000");
    expect(
      resolveSiteOrigin({ explicit: "https://www.vistrial.io/", nodeEnv: "development" })
    ).toBe(PRODUCTION_SITE_ORIGIN);
  });
});

describe("shouldRedirectToSiteHost", () => {
  it("sends www and other public hosts to vistrial.io", () => {
    expect(
      shouldRedirectToSiteHost({ hostname: "www.vistrial.io", pathname: "/" })
    ).toBe(true);
    expect(
      shouldRedirectToSiteHost({ hostname: "vistrial.vercel.app", pathname: "/privacy" })
    ).toBe(true);
  });

  it("leaves the apex site, the app, local, API, and previews alone", () => {
    expect(shouldRedirectToSiteHost({ hostname: "vistrial.io", pathname: "/" })).toBe(false);
    expect(
      shouldRedirectToSiteHost({ hostname: "app.vistrial.io", pathname: "/login" })
    ).toBe(false);
    expect(
      shouldRedirectToSiteHost({ hostname: "localhost:3000", pathname: "/" })
    ).toBe(false);
    expect(
      shouldRedirectToSiteHost({ hostname: "www.vistrial.io", pathname: "/api/cron/ghl-ingest" })
    ).toBe(false);
    expect(
      shouldRedirectToSiteHost({
        hostname: "vistrial-git-preview.vercel.app",
        pathname: "/",
        vercelEnv: "preview",
      })
    ).toBe(false);
  });
});

describe("hostnameFromHostHeader", () => {
  it("strips the port", () => {
    expect(hostnameFromHostHeader("localhost:3000")).toBe("localhost");
    expect(hostnameFromHostHeader("vistrial.io")).toBe("vistrial.io");
  });
});
