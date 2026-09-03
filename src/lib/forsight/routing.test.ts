import { describe, expect, it } from "vitest";

import { isAllowedAppOrigin } from "@/lib/app-url";
import { PRODUCTION_FORSIGHT_ORIGIN } from "@/lib/constants";
import { isForsightHost, isOperatorAppHost } from "@/lib/marketing/hosts";
import { FORSIGHT_PATH, MORE_NAV, PRIMARY_NAV, navVisibleTo } from "@/lib/navigation";

describe("pulse.vistrial.io", () => {
  it("is recognised as Forsight and not as the operator app host", () => {
    expect(isForsightHost("pulse.vistrial.io")).toBe(true);
    expect(isForsightHost("pulse.vistrial.io:443")).toBe(true);
    expect(isForsightHost("PULSE.VISTRIAL.IO")).toBe(true);
    expect(isForsightHost("app.vistrial.io")).toBe(false);
    expect(isOperatorAppHost("pulse.vistrial.io")).toBe(false);
  });

  it("does not treat a lookalike host as Forsight", () => {
    expect(isForsightHost("pulse.vistrial.io.evil.example")).toBe(false);
    expect(isForsightHost("")).toBe(false);
    expect(isForsightHost(null)).toBe(false);
  });

  it("is an allowed origin, so signing in there lands back there", () => {
    expect(isAllowedAppOrigin(PRODUCTION_FORSIGHT_ORIGIN)).toBe(true);
  });
});

describe("Forsight in the app", () => {
  it("lives under /app so the existing login gate covers it", () => {
    expect(FORSIGHT_PATH.startsWith("/app/")).toBe(true);
  });

  it("sits behind More, not in the sidebar", () => {
    expect(PRIMARY_NAV.find((entry) => entry.href === FORSIGHT_PATH)).toBeUndefined();
    const item = MORE_NAV.find((entry) => entry.href === FORSIGHT_PATH);
    expect(item).toBeDefined();
    expect(item?.label).toBe("Tracking");
  });

  it("follows the owner's visibility rather than inventing its own", () => {
    const item = MORE_NAV.find((entry) => entry.href === FORSIGHT_PATH);
    if (!item) throw new Error("Tracking is missing from More");
    expect(navVisibleTo(item, "owner")).toBe(true);
    expect(navVisibleTo(item, "admin")).toBe(true);
    expect(navVisibleTo(item, "setter")).toBe(false);
    expect(navVisibleTo(item, "setter", true)).toBe(true);
  });
});
