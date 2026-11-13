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

  it("lights up HighLevel as soon as a provider keyed highlevel is registered and set up, with no change here", () => {
    expect(connectCards({ ...none, providers: [{ key: HIGHLEVEL_KEY, readiness: "not_set_up", connection: null }] }).find((row) => row.key === HIGHLEVEL_KEY)?.state).toBe("notSetUp");
    expect(connectCards({ ...none, providers: [{ key: HIGHLEVEL_KEY, readiness: "ready", connection: null }] }).find((row) => row.key === HIGHLEVEL_KEY)?.state).toBe("available");
    // HubSpot and Salesforce stay "Coming soon" whatever is registered.
    expect(connectCards({ ...none, providers: [{ key: "hubspot", readiness: "ready", connection: null }] }).find((row) => row.key === "hubspot")?.state).toBe("comingSoon");
  });
});
