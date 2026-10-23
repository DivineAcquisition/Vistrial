/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import { CATALOG } from "./catalog";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

describe("agent catalog", () => {
  it("seeds the six agents once, and a new row shows up in the list", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.agents.ensure, {});
    await t.mutation(api.agents.ensure, {});
    const seeded = await t.query(api.agents.list, {});
    expect(seeded.map((row) => row.slug)).toEqual(CATALOG.map((row) => row.slug));

    await t.run(async (ctx) => {
      await ctx.db.insert("agents", {
        slug: "north",
        name: "North",
        stage: "foundation",
        job: "Watches a motion the others do not.",
        promise: "North never messages a lead.",
        sort: 9,
      });
    });

    const withNorth = await t.query(api.agents.list, {});
    expect(withNorth.map((row) => row.slug)).toContain("north");
    expect(withNorth.filter((row) => row.slug === "compass")).toHaveLength(1);
  });
});
