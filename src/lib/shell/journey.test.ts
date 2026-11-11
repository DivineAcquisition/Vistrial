import { describe, expect, it } from "vitest";

import { CATALOG } from "../../../convex/catalog";
import { agentDot, agentsForTab, agentsOffJourney, defaultTab, journeyTabOf, agentTabs, liveSkills, tabForPath, workTabsFor } from "./journey";
import type { RailAgent } from "./rail";

const agents: RailAgent[] = CATALOG.map((row) => ({ ...row, skills: row.skills }));

describe("journey tabs", () => {
  it("groups catalog agents by lifecycle", () => {
    expect(agentsForTab(agents, "attract").map((row) => row.slug)).toEqual(["growth-architect", "campaign-execution"]);
    expect(agentsForTab(agents, "convert").map((row) => row.slug)).toEqual(["sales-conversion"]);
    expect(agentsForTab(agents, "keep").map((row) => row.slug)).toEqual(["activation", "retention", "expansion"]);
    expect(agentsOffJourney(agents).map((row) => row.slug)).toEqual(["operations-intelligence"]);
    expect(journeyTabOf("Grow")).toBe("keep");
    expect(journeyTabOf(null)).toBeNull();
  });

  it("gives a live agent one work tab per live skill, named for the outcome", () => {
    const growth = agents.find((row) => row.slug === "growth-architect")!;
    expect(workTabsFor(growth).map((row) => [row.label, row.href])).toEqual([
      ["Research", "/app/agents/growth-architect/work/research"],
      ["Offers", "/app/agents/growth-architect/work/offers"],
      ["Diagnostics", "/app/agents/growth-architect/work/diagnostics"],
    ]);
    expect(liveSkills(growth).every((row) => row.status === "available")).toBe(true);
    // No tabs for coming-soon skills or planned agents.
    const onlyMarket = { ...growth, skills: growth.skills!.map((row) => (row.slug === "market-intelligence" ? row : { ...row, status: "comingSoon" as const })) };
    expect(workTabsFor(onlyMarket).map((row) => row.tab)).toEqual(["research"]);
    expect(workTabsFor(agents.find((row) => row.slug === "retention")!)).toEqual([]);
  });

  it("lists the sidebar tabs under an agent: Chat first, then one per live skill, then Creative, Pages and Brands", () => {
    const growth = agents.find((row) => row.slug === "growth-architect")!;
    expect(agentTabs(growth).map((row) => [row.label, row.href])).toEqual([
      ["Chat", "/app/agents/growth-architect/work/chat"],
      ["Research", "/app/agents/growth-architect/work/research"],
      ["Offers", "/app/agents/growth-architect/work/offers"],
      ["Diagnostics", "/app/agents/growth-architect/work/diagnostics"],
      ["Creative", "/app/agents/growth-architect/work/creative"],
      ["Pages", "/app/agents/growth-architect/work/pages"],
      ["Brands", "/app/agents/growth-architect/work/brands"],
    ]);
    // Chat and Brands belong to no single skill; every other tab names the skill whose counts it shows.
    expect(agentTabs(growth).map((row) => row.skillSlug)).toEqual([null, "market-intelligence", "offer-intelligence", "growth-diagnostics", "creative-production", "landing-page-teardown", null]);
    // Chat stays first when only some skills are live.
    const onlyOffers = { ...growth, skills: growth.skills!.map((row) => (row.slug === "offer-intelligence" ? row : { ...row, status: "comingSoon" as const })) };
    expect(agentTabs(onlyOffers).map((row) => row.tab)).toEqual(["chat", "offers", "brands"]);
    // No work tab, no chat: planned agents and agents with no live skill have no tabs at all.
    expect(agentTabs(agents.find((row) => row.slug === "retention")!)).toEqual([]);
    expect(agentTabs({ ...growth, skills: growth.skills!.map((row) => ({ ...row, status: "comingSoon" as const })) })).toEqual([]);
    expect(agentTabs({ ...growth, status: "planned" as never })).toEqual([]);
  });

  it("picks a dot, a default tab and the tab for the open page", () => {
    expect(agentDot({ working: 1, waiting: 1 })).toBe("waiting");
    expect(agentDot({ working: 2, waiting: 0 })).toBe("working");
    expect(agentDot(undefined)).toBe("idle");
    expect(defaultTab(agents)).toBe("attract");
    expect(tabForPath("/app/agents/retention", agents)).toBe("keep");
    expect(tabForPath("/app/research", agents)).toBeNull();
  });
});
