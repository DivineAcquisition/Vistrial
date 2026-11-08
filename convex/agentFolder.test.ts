/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const identity = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });

describe("agent folders", () => {
  it("lists the Growth Architect's sessions with their state, and keeps them to the workspace", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await t.mutation(internal.reviewer.setUpReviewerWorkspace, { userId: "user_owner" });
    await t.run(async (ctx) => {
      await ctx.db.insert("researchProjects", {
        workspaceId,
        title: "Austin deep cleaning",
        objective: "What do competitors lead with?",
        market: "Deep cleaning",
        geography: "Austin, TX",
        competitors: [],
        platforms: ["web"],
        suppliedUrls: [],
        status: "draft",
        createdBy: "user_owner",
        createdAt: 1,
        updatedAt: 1,
      });
      const other = await ctx.db.insert("workspaces", { name: "Other", slug: "other", timezone: "UTC", status: "active", createdAt: 0 });
      await ctx.db.insert("members", { workspaceId: other, userId: "user_other", role: "owner", displayName: "Other", active: true });
    });
    const tree = await t.withIdentity(identity("user_owner")).query(api.agentFolder.tree, { workspaceId, agentSlug: "growth-architect" });
    expect(tree.sessions).toHaveLength(1);
    expect(tree.sessions[0]).toMatchObject({ title: "Austin deep cleaning", state: "draft" });
    expect(tree.connections.map((row) => row.key)).toEqual(["meta"]);
    expect(tree.connections[0].state).toBe("off");
    await expect(t.withIdentity(identity("user_other")).query(api.agentFolder.tree, { workspaceId, agentSlug: "growth-architect" })).rejects.toThrow();
  });

  it("grants and withdraws an agent's use of the Meta connection, owner only", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await t.mutation(internal.reviewer.setUpReviewerWorkspace, { userId: "user_owner" });
    await t.run(async (ctx) => {
      await ctx.db.insert("members", { workspaceId, userId: "user_rep", role: "rep", displayName: "Rep", active: true });
    });
    await t.mutation(internal.metaAds.saveConnection, {
      workspaceId,
      source: "oauth",
      accessToken: "SECRET",
      scopes: ["ads_read"],
      metaUserId: "m1",
      metaUserName: "Pat",
      connectedBy: "user_owner",
      calls: 0,
    });
    const owner = t.withIdentity(identity("user_owner"));
    expect((await owner.query(api.agentFolder.tree, { workspaceId, agentSlug: "growth-architect" })).connections[0].state).toBe("on");
    await owner.mutation(api.metaAds.setAgentAccess, { workspaceId, agentSlug: "growth-architect", granted: false });
    expect((await owner.query(api.agentFolder.tree, { workspaceId, agentSlug: "growth-architect" })).connections[0].state).toBe("notGranted");
    await expect(t.withIdentity(identity("user_rep")).mutation(api.metaAds.setAgentAccess, { workspaceId, agentSlug: "growth-architect", granted: true })).rejects.toThrow();
  });
});
