import { describe, expect, it } from "vitest";

import { HIGHLEVEL_KEY, connectCards } from "./connect";

const none = { meta: null, providers: [], uploads: 0 };

describe("the accounts onboarding offers", () => {
  it("lists what is built, then the CRMs, every one optional", () => {
    const cards = connectCards(none);
    expect(cards.map((row) => [row.key, row.state])).toEqual([
      ["meta", "notSetUp"],
      ["google_calendar", "comingSoon"],
      ["calendly", "comingSoon"],
      ["results", "available"],
      [HIGHLEVEL_KEY, "comingSoon"],
      ["hubspot", "comingSoon"],
      ["salesforce", "comingSoon"],
    ]);
  });

  it("shows what is connected, what can be, and what needs reconnecting", () => {
    const cards = connectCards({
      meta: { configured: true, connected: true, label: "Brightline Ads" },
      providers: [
        { key: "google_calendar", readiness: "ready", connection: null },
        { key: "calendly", readiness: "ready", connection: { status: "needsReconnect", accountLabel: "dana@example.com" } },
      ],
      uploads: 2,
    });
    const by = Object.fromEntries(cards.map((row) => [row.key, [row.state, row.label]]));
    expect(by.meta).toEqual(["connected", "Brightline Ads"]);
    expect(by.google_calendar).toEqual(["available", null]);
    expect(by.calendly).toEqual(["needsReconnect", "dana@example.com"]);
    expect(by.results).toEqual(["connected", "2 files"]);
  });

  it("takes HighLevel's state from the HighLevel connection itself", () => {
    const state = (highLevel: Parameters<typeof connectCards>[0]["highLevel"]) => connectCards({ ...none, highLevel }).find((row) => row.key === HIGHLEVEL_KEY);
    expect(state({ configured: false, connected: false, label: null })?.state).toBe("notSetUp");
    expect(state({ configured: true, connected: false, label: null })?.state).toBe("available");
    expect(state({ configured: true, connected: true, label: "Brightline Media" })).toMatchObject({ state: "connected", label: "Brightline Media" });
    // HubSpot and Salesforce stay "Coming soon" whatever is registered.
    expect(connectCards({ ...none, providers: [{ key: "hubspot", readiness: "ready", connection: null }] }).find((row) => row.key === "hubspot")?.state).toBe("comingSoon");
  });
});
