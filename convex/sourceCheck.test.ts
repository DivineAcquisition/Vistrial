/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

describe("source probe", () => {
  it("refuses an unknown platform", async () => {
    const t = convexTest(schema, modules);
    await expect(t.action(internal.sourceCheck.probe, { platform: "myspace", market: "cleaning", geography: "London, UK" })).rejects.toThrow(/Pick one of/);
  });

  it("checks Meta Ad Library coverage before any network call", async () => {
    const t = convexTest(schema, modules);
    const result = await t.action(internal.sourceCheck.probe, { platform: "metaAdLibrary", market: "cleaning", geography: "Austin, TX" });
    expect(result.reasonCode).toBe("commercial_outside_eu_uk");
    expect(result.found).toBe(0);
  });

  it("reports a missing token without calling Meta", async () => {
    const t = convexTest(schema, modules);
    const saved = process.env.META_AD_ACCESS_TOKEN;
    delete process.env.META_AD_ACCESS_TOKEN;
    expect(await t.action(internal.sourceCheck.metaToken, { setting: "META_AD_ACCESS_TOKEN" })).toEqual({ setting: "META_AD_ACCESS_TOKEN", present: false });
    if (saved !== undefined) process.env.META_AD_ACCESS_TOKEN = saved;
  });
});
