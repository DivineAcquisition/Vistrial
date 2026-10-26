import { describe, expect, it } from "vitest";

import { CATALOG, type CatalogAgent } from "../../../convex/catalog";
import { railAgentSlugs, railFromCatalog } from "@/lib/shell/rail";

describe("workspace rail", () => {
  it("lists each seeded agent once, Compass above the stages", () => {
    const rail = railFromCatalog(CATALOG);
    expect(rail.compass?.name).toBe("Compass");
    expect(railAgentSlugs(rail)).toEqual(["compass", "scribe", "assay", "relay", "sentry", "helm"]);
    expect(rail.stages.map((group) => group.label)).toEqual(["Organization", "Execution"]);
  });

  it("shows a new registry row without a code change", () => {
    const north: CatalogAgent = {
      slug: "north",
      name: "North",
      stage: "foundation",
      job: "Watches a motion the others do not.",
      promise: "North never messages a lead.",
      sort: 9,
    };
    const rail = railFromCatalog([...CATALOG, north]);
    expect(rail.stages.find((group) => group.stage === "foundation")?.agents.map((agent) => agent.slug)).toEqual([
      "north",
    ]);
    expect(railAgentSlugs(rail).filter((slug) => slug === "compass")).toEqual(["compass"]);
    expect(railAgentSlugs(rail)).toContain("north");
  });
});
