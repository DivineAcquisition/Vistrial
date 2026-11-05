/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

async function setup() {
  const t = convexTest(schema, modules);
  const workspaceId = await t.mutation(internal.reviewer.setUpReviewerWorkspace, { userId: "user_owner" });
  const repId = await t.run(async (ctx) => {
    await ctx.db.insert("members", { workspaceId, userId: "user_rep", role: "rep", displayName: "Rep", active: true });
    const other = await ctx.db.insert("workspaces", { name: "Other", slug: "other", timezone: "UTC", status: "active", createdAt: 0 });
    await ctx.db.insert("members", { workspaceId: other, userId: "user_other", role: "owner", displayName: "Other", active: true });
    return other;
  });
  const owner = t.withIdentity({ subject: "user_owner", issuer: "https://clerk.test", tokenIdentifier: "x|user_owner", name: "Owner", email: "o@example.com" });
  const rep = t.withIdentity({ subject: "user_rep", issuer: "https://clerk.test", tokenIdentifier: "x|user_rep", name: "Rep", email: "r@example.com" });
  const stranger = t.withIdentity({ subject: "user_other", issuer: "https://clerk.test", tokenIdentifier: "x|user_other", name: "Other", email: "s@example.com" });
  return { t, workspaceId, otherWorkspace: repId, owner, rep, stranger };
}

async function connect(t: ReturnType<typeof convexTest>, workspaceId: Id<"workspaces">) {
  await t.mutation(internal.metaAds.saveConnection, {
    workspaceId,
    source: "oauth",
    accessToken: "SECRET-TOKEN",
    scopes: ["ads_read"],
    metaUserId: "m1",
    metaUserName: "Pat",
    connectedBy: "user_owner",
    calls: 4,
  });
}

describe("Meta ads connection", () => {
  it("never returns the token, and shows members the connection", async () => {
    const { t, workspaceId, rep } = await setup();
    await connect(t, workspaceId);
    const status = await rep.query(api.metaAds.status, { workspaceId });
    expect(JSON.stringify(status)).not.toContain("SECRET-TOKEN");
    expect(status.connection).toMatchObject({ metaUserName: "Pat", status: "connected", calls: { ok: 4, failed: 0, successRate: 1 } });
    expect(status.canManage).toBe(false);
  });

  it("keeps each workspace's connection to itself", async () => {
    const { t, workspaceId, stranger } = await setup();
    await connect(t, workspaceId);
    await expect(stranger.query(api.metaAds.status, { workspaceId })).rejects.toThrow();
  });

  it("lets only an owner start Facebook Login, and each login attempt works once", async () => {
    const { t, workspaceId, owner, rep } = await setup();
    process.env.META_APP_ID = "123";
    process.env.META_APP_SECRET = "s";
    process.env.CONVEX_SITE_URL = "https://example.convex.site";
    await expect(rep.mutation(api.metaAds.startConnect, { workspaceId })).rejects.toThrow();
    const { url } = await owner.mutation(api.metaAds.startConnect, { workspaceId, returnOrigin: "https://evil.example.com" });
    const nonce = new URL(url).searchParams.get("state")!;
    expect(new URL(url).searchParams.get("redirect_uri")).toBe("https://example.convex.site/meta/callback");
    expect(new URL(url).searchParams.get("scope")).toBe("ads_read");
    const first = await t.mutation(internal.metaAds.consumeState, { nonce });
    expect(first).toMatchObject({ workspaceId, userId: "user_owner", returnOrigin: null });
    expect(await t.mutation(internal.metaAds.consumeState, { nonce })).toBeNull();
  });

  it("disconnect removes the token and every saved read", async () => {
    const { t, workspaceId, owner } = await setup();
    await connect(t, workspaceId);
    await t.mutation(internal.metaAds.saveSnapshot, {
      workspaceId,
      adAccountId: "act_1",
      currency: "USD",
      range: "last_30d",
      dateStart: "2026-10-01",
      dateStop: "2026-10-30",
      totals: { spend: 1, impressions: 1, clicks: 1, reach: 1, active: 0, ctr: 1, cpc: 1 },
      daily: [],
      campaigns: [],
    });
    await owner.mutation(api.metaAds.disconnect, { workspaceId });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("metaConnections").collect()).toHaveLength(0);
      expect(await ctx.db.query("metaAdSnapshots").collect()).toHaveLength(0);
    });
  });
});
