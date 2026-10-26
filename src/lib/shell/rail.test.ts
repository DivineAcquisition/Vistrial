import { describe, expect, it } from "vitest";

import { CATALOG, type CatalogAgent } from "../../../convex/catalog";
import { railAgentSlugs, railFromCatalog } from "@/lib/shell/rail";

describe("workspace rail", () => {
  it("lists the three areas and one agent in each", () => {
    const rail = railFromCatalog(CATALOG);
    expect(rail.areas.map((group) => group.label)).toEqual(["Sales", "Retention", "Operations"]);
    expect(railAgentSlugs(rail)).toEqual(["sales", "retention", "operations"]);
    expect(CATALOG.find((agent) => agent.slug === "sales")?.skills.map((skill) => skill.slug)).toEqual([
      "ad-research",
      "ad-copy",
      "creative",
      "content",
    ]);
  });

  it("shows a new registry row in its area without a code change", () => {
    const north: CatalogAgent = {
      slug: "north",
      name: "North",
      area: "sales",
      stage: "execution",
      job: "Watches a motion the others do not.",
      promise: "North never posts.",
      sort: 9,
      skills: [],
    };
    const rail = railFromCatalog([...CATALOG, north]);
    expect(rail.areas.find((group) => group.area === "sales")?.agents.map((agent) => agent.slug)).toEqual([
      "sales",
      "north",
    ]);
  });
});
