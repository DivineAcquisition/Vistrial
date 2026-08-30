import { describe, expect, it } from "vitest";

import { buildHubCards, crmHubCard, hubSummaryLine, sourceHubCard } from "@/lib/integrations/hub";
import { SOURCE_CATALOG } from "@/lib/sources/catalog";
import type { SourceCardModel } from "@/lib/sources/catalog";
import type { SourceKind } from "@/types/database";

function source(kind: SourceKind, over: Partial<SourceCardModel> = {}): SourceCardModel {
  return {
    ...SOURCE_CATALOG[kind],
    kind,
    connectMode: "oauth",
    status: "missing",
    provider: "test",
    accountLabel: null,
    lastVerifiedAt: null,
    lastError: null,
    publicToken: null,
    metadata: {},
    webhookUrl: null,
    unavailableReason: "",
    connected: false,
    ...over,
  };
}

describe("integration hub", () => {
  it("gives the CRM a one-click connect when marketplace keys are configured", () => {
    const card = crmHubCard({
      status: "missing",
      locationName: null,
      lastVerifiedAt: null,
      oauthConfigured: true,
    });
    expect(card.connect).toEqual({ mode: "redirect", href: "/api/leadconnector/oauth/start" });
    expect(card.status).toBe("available");
    expect(card.required).toBe(true);
  });

  it("says so plainly when the deployment has no marketplace credentials", () => {
    const card = crmHubCard({
      status: "missing",
      locationName: null,
      lastVerifiedAt: null,
      oauthConfigured: false,
    });
    expect(card.connect.mode).toBe("unavailable");
    expect(card.status).toBe("unavailable");
    expect(card.note).toContain("not configured");
  });

  it("treats a broken CRM token as needing attention, not as disconnected", () => {
    const card = crmHubCard({
      status: "broken",
      locationName: "Main",
      lastVerifiedAt: null,
      oauthConfigured: true,
    });
    expect(card.status).toBe("attention");
    expect(card.statusLabel).toBe("Needs attention");
  });

  it("routes an OAuth source straight to the provider and keeps key sources honest", () => {
    expect(sourceHubCard(source("meta_ads")).connect).toEqual({
      mode: "redirect",
      href: "/api/sources/oauth/start?kind=meta_ads",
    });
    expect(sourceHubCard(source("commas", { connectMode: "api_key" })).connect.mode).toBe("api_key");
    expect(sourceHubCard(source("calendar", { connectMode: "ghl_reuse" })).connect.mode).toBe("reuse");
  });

  it("carries an unavailable reason onto the tile instead of a dead button", () => {
    const card = sourceHubCard(
      source("stripe", { connectMode: "unavailable", unavailableReason: "Not configured here." })
    );
    expect(card.status).toBe("unavailable");
    expect(card.note).toBe("Not configured here.");
  });

  it("puts the CRM first, then what needs attention before what is merely available", () => {
    const cards = buildHubCards(
      { status: "active", locationName: "Main", lastVerifiedAt: null, oauthConfigured: true },
      [
        source("meta_ads"),
        source("stripe", { status: "broken", lastError: "Token expired." }),
        source("google_ads", { connectMode: "unavailable", unavailableReason: "No keys." }),
      ]
    );
    expect(cards[0]?.id).toBe("leadconnector");
    expect(cards[1]?.id).toBe("stripe");
    expect(cards.at(-1)?.id).toBe("google_ads");
  });

  it("counts only connectable tiles in the summary line", () => {
    const cards = buildHubCards(
      { status: "active", locationName: "Main", lastVerifiedAt: null, oauthConfigured: true },
      [source("meta_ads"), source("stripe", { connectMode: "unavailable" })]
    );
    expect(hubSummaryLine(cards)).toBe("1 of 2 connected");
  });

  it("names how many need attention so a broken source is not silently counted out", () => {
    const cards = buildHubCards(
      { status: "broken", locationName: "Main", lastVerifiedAt: null, oauthConfigured: true },
      [source("meta_ads", { status: "active" })]
    );
    expect(hubSummaryLine(cards)).toBe("1 of 2 connected · 1 need attention");
  });
});
