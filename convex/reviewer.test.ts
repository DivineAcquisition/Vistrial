/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import { GROWTH_ARCHITECT } from "./catalog";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

describe("reviewer workspace", () => {
  it("sets up a ready workspace once, and reruns change nothing", async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(internal.reviewer.setUpReviewerWorkspace, { userId: "user_reviewer" });
    const again = await t.mutation(internal.reviewer.setUpReviewerWorkspace, { userId: "user_reviewer" });
    expect(again).toBe(first);
    await t.run(async (ctx) => {
      const members = await ctx.db.query("members").withIndex("by_user", (q) => q.eq("userId", "user_reviewer")).collect();
      expect(members).toHaveLength(1);
      expect(members[0].role).toBe("owner");
      const settings = await ctx.db.query("workspaceSettings").withIndex("by_workspace", (q) => q.eq("workspaceId", first)).unique();
      expect(settings?.setupDone).toBe(true);
      const agent = await ctx.db.query("agents").withIndex("by_slug", (q) => q.eq("slug", GROWTH_ARCHITECT)).unique();
      const link = await ctx.db
        .query("workspaceAgents")
        .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", first).eq("agentId", agent!._id))
        .unique();
      expect(link?.state).toBe("on");
      const profiles = await ctx.db.query("profileVersions").withIndex("by_workspace", (q) => q.eq("workspaceId", first)).collect();
      expect(profiles.filter((row) => row.status === "confirmed")).toHaveLength(1);
      expect(profiles[0].geography).toBe("London, UK");
    });
  });

  it("refuses to run without the Clerk secret key", async () => {
    const t = convexTest(schema, modules);
    const saved = process.env.CLERK_SECRET_KEY;
    delete process.env.CLERK_SECRET_KEY;
    await expect(t.action(internal.reviewer.createReviewerAccount, { email: "reviewer@example.com" })).rejects.toThrow(/CLERK_SECRET_KEY/);
    if (saved !== undefined) process.env.CLERK_SECRET_KEY = saved;
  });
});
