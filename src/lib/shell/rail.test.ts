import { describe, expect, it } from "vitest";

import { CATALOG, type CatalogAgent } from "../../../convex/catalog";
import { railAgentSlugs, railFromCatalog } from "@/lib/shell/rail";

describe("workspace rail", () => {
  it("lists the three agents once, grouped by area in order", () => {
    const rail = railFromCatalog(CATALOG);
    expect(railAgentSlugs(rail)).toEqual(["sales", "retention", "operations"]);
    expect(rail.areas.map((group) => group.label)).toEqual(["Sales", "Retention", "Operations"]);
  });

  it("seeds every skill as coming soon", () => {
    for (const agent of CATALOG) {
      expect(agent.skills.length).toBeGreaterThan(0);
      expect(agent.skills.every((skill) => skill.status === "comingSoon")).toBe(true);
    }
  });

  it("shows a new registry row without a code change", () => {
    const extra: CatalogAgent = {
      slug: "extra",
      name: "Extra Agent",
      area: "sales",
      job: "Watches a motion the others do not.",
      promise: "Extra never posts anything.",
      sort: 9,
      skills: [],
    };
    const rail = railFromCatalog([...CATALOG, extra]);
    expect(rail.areas.find((group) => group.area === "sales")?.agents.map((agent) => agent.slug)).toEqual([
      "sales",
      "extra",
    ]);
  });
});
