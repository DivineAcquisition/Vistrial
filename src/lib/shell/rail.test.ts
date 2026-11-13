import { describe, expect, it } from "vitest";

import { CATALOG, type CatalogAgent } from "../../../convex/catalog";
import { agentStateLabel, railAgentSlugs, railFromCatalog } from "@/lib/shell/rail";

describe("workspace rail", () => {
  it("lists the four departments and the seven agents in workforce order", () => {
    const rail = railFromCatalog(CATALOG);
    expect(rail.departments.map((group) => group.label)).toEqual([
      "Growth and Marketing",
      "Sales",
      "Customer Success",
      "Operations",
    ]);
    expect(railAgentSlugs(rail)).toEqual([
      "growth-architect",
      "campaign-execution",
      "sales-conversion",
      "activation",
      "retention",
      "expansion",
      "operations-intelligence",
    ]);
    expect(CATALOG.map((agent) => agent.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("has Strategist as the only live agent, with its seven skills", () => {
    expect(CATALOG.filter((agent) => agent.status === "live").map((agent) => agent.slug)).toEqual(["growth-architect"]);
    expect(CATALOG.find((agent) => agent.slug === "growth-architect")?.skills.map((skill) => skill.slug)).toEqual([
      "market-intelligence",
      "offer-intelligence",
      "campaign-strategy",
      "creative-production",
      "funnel-architect",
      "growth-diagnostics",
      "landing-page-teardown",
    ]);
  });

  it("uses the department name stored in the table", () => {
    const rail = railFromCatalog(CATALOG, [
      { slug: "growth", name: "Growth", sort: 0 },
      { slug: "sales", name: "Pipeline", sort: 1 },
      { slug: "customer-success", name: "Customers", sort: 2 },
      { slug: "operations", name: "Run", sort: 3 },
    ]);
    expect(rail.departments.map((group) => group.label)).toEqual(["Growth", "Pipeline", "Customers", "Run"]);
  });

  it("shows a new registry row in its department without a code change", () => {
    const north: CatalogAgent = {
      slug: "north",
      number: 8,
      name: "North",
      department: "growth",
      status: "planned",
      lifecycle: "Attract",
      job: "Watches a motion the others do not.",
      promise: "North never posts.",
      sort: 9,
      skills: [],
    };
    const rail = railFromCatalog([...CATALOG, north]);
    expect(rail.departments.find((group) => group.department === "growth")?.agents.map((agent) => agent.slug)).toEqual([
      "growth-architect",
      "campaign-execution",
      "north",
    ]);
  });

  it("labels planned agents Planned, whatever their stored state", () => {
    expect(agentStateLabel({ status: "planned", state: "on" })).toBe("Planned");
    expect(agentStateLabel({ status: "live", state: "on" })).toBe("On");
    expect(agentStateLabel({ status: "live", state: "suggesting" })).toBe("Suggesting");
    expect(agentStateLabel({ status: "live", state: "off" })).toBe("Off");
  });
});
