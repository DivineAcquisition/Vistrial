import { describe, expect, it } from "vitest";

import { CATALOG } from "../../../convex/catalog";
import { agentDot, agentTabs, agentsForTab, agentsOffJourney, defaultTab, journeyTabOf, liveSkills, skillChipLabel, tabForPath } from "./journey";
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

  it("names skills short enough for a chip and lists only live ones", () => {
    expect(skillChipLabel("Market Intelligence")).toBe("Market");
    expect(skillChipLabel("Offer Intelligence")).toBe("Offer");
    expect(skillChipLabel("Growth Diagnostics")).toBe("Diagnostics");
    const growth = agents.find((row) => row.slug === "growth-architect")!;
    expect(liveSkills(growth).map((row) => row.slug)).toEqual(expect.arrayContaining(["market-intelligence", "offer-intelligence"]));
    expect(liveSkills(growth).every((row) => row.status === "available")).toBe(true);
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

describe("agent tabs", () => {
  it("opens a live agent into one tab per live skill, named for the work", () => {
    const agent = {
      slug: "growth-architect",
      skills: [
        { slug: "growth-diagnostics", name: "Growth Diagnostics", status: "available", sort: 2 },
        { slug: "market-intelligence", name: "Market Intelligence", status: "available", sort: 0 },
        { slug: "offer-intelligence", name: "Offer Intelligence", status: "available", sort: 1 },
        { slug: "campaign-strategy", name: "Campaign Strategy", status: "comingSoon", sort: 3 },
      ],
    } as unknown as RailAgent;
    expect(agentTabs(agent)).toEqual([
      { slug: "market-intelligence", label: "Research", href: "/app/agents/growth-architect/work/research" },
      { slug: "offer-intelligence", label: "Offers", href: "/app/agents/growth-architect/work/offers" },
      { slug: "growth-diagnostics", label: "Diagnostics", href: "/app/agents/growth-architect/work/diagnostics" },
    ]);
  });
});
