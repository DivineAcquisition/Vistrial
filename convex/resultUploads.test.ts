/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const identity = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });

const GOOGLE = `Day,Campaign,Cost,Impr.,Clicks,Conversions,Conv. value
2026-09-01,Search - Brand,120.00,3000,240,10,2500
2026-09-02,Search - Generic,80.00,5000,100,2,400
`;

async function setUp() {
  const t = convexTest(schema, modules);
  const workspaceId = await t.mutation(internal.reviewer.setUpReviewerWorkspace, { userId: "user_owner" });
  await t.run(async (ctx) => {
    await ctx.db.insert("members", { workspaceId, userId: "user_rep", role: "rep", displayName: "Rep", active: true });
    await ctx.db.insert("members", { workspaceId, userId: "user_manager", role: "manager", displayName: "Manager", active: true });
  });
  return { t, workspaceId };
}

async function upload(t: Awaited<ReturnType<typeof setUp>>["t"], workspaceId: Id<"workspaces">, text: string, user = "user_owner") {
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob([text])));
  const uploadId = await t.withIdentity(identity(user)).mutation(api.resultUploads.start, {
    workspaceId,
    storageId,
    fileName: "google-ads.csv",
    label: "Google Ads",
    currency: "usd",
  });
  await t.action(internal.resultUploads.parse, { uploadId });
  return { uploadId, storageId };
}

describe("results files", () => {
  it("keeps the totals, deletes the file, and shows on the agent's folder", async () => {
    const { t, workspaceId } = await setUp();
    const { uploadId, storageId } = await upload(t, workspaceId, GOOGLE, "user_manager");
    const owner = t.withIdentity(identity("user_owner"));
    const [row] = await owner.query(api.resultUploads.list, { workspaceId });
    expect(row).toMatchObject({ id: uploadId, status: "ready", currency: "USD", label: "Google Ads", agents: ["growth-architect"] });
    expect(row.summary?.totals).toEqual({ spend: 200, impressions: 8000, clicks: 340, conversions: 12, revenue: 2900 });
    expect(await t.run((ctx) => ctx.storage.get(storageId))).toBeNull();
    const tree = await owner.query(api.agentFolder.tree, { workspaceId, agentSlug: "growth-architect" });
    expect(tree.connections.find((entry) => entry.key === "results")).toMatchObject({ state: "on", detail: "1 file" });
  });

  it("refuses a customer list, keeps no values, and still deletes the file", async () => {
    const { t, workspaceId } = await setUp();
    const { storageId } = await upload(t, workspaceId, "First name,Email,Phone\nAnn,ann@x.com,555-0100\n");
    const [row] = await t.withIdentity(identity("user_owner")).query(api.resultUploads.list, { workspaceId });
    expect(row).toMatchObject({ status: "refused", code: "personal_data", ignoredColumns: ["First name", "Email", "Phone"], summary: null });
    expect(JSON.stringify(row)).not.toMatch(/ann@x|555-/);
    expect(await t.run((ctx) => ctx.storage.get(storageId))).toBeNull();
  });

  it("lets owners and managers upload, not reps; only owners grant agents", async () => {
    const { t, workspaceId } = await setUp();
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob([GOOGLE])));
    const rep = t.withIdentity(identity("user_rep"));
    await expect(rep.mutation(api.resultUploads.createUpload, { workspaceId })).rejects.toThrow();
    await expect(
      rep.mutation(api.resultUploads.start, { workspaceId, storageId, fileName: "a.csv", label: "Google Ads", currency: "USD" }),
    ).rejects.toThrow();
    const { uploadId } = await upload(t, workspaceId, GOOGLE);
    await expect(
      t.withIdentity(identity("user_manager")).mutation(api.resultUploads.setAgentAccess, { workspaceId, uploadId, agentSlug: "growth-architect", granted: false }),
    ).rejects.toThrow();
    const owner = t.withIdentity(identity("user_owner"));
    await owner.mutation(api.resultUploads.setAgentAccess, { workspaceId, uploadId, agentSlug: "growth-architect", granted: false });
    const tree = await owner.query(api.agentFolder.tree, { workspaceId, agentSlug: "growth-architect" });
    expect(tree.connections.find((entry) => entry.key === "results")?.state).toBe("notGranted");
    expect(await t.query(internal.resultUploads.readyForAgent, { workspaceId, agentSlug: "growth-architect" })).toEqual([]);
  });

  it("keeps uploads to their workspace", async () => {
    const { t, workspaceId } = await setUp();
    const { uploadId } = await upload(t, workspaceId, GOOGLE);
    const otherId = await t.run(async (ctx) => {
      const other = await ctx.db.insert("workspaces", { name: "Other", slug: "other", timezone: "UTC", status: "active", createdAt: 0 });
      await ctx.db.insert("members", { workspaceId: other, userId: "user_other", role: "owner", displayName: "Other", active: true });
      return other;
    });
    const stranger = t.withIdentity(identity("user_other"));
    await expect(stranger.query(api.resultUploads.list, { workspaceId })).rejects.toThrow();
    expect(await stranger.query(api.resultUploads.list, { workspaceId: otherId })).toEqual([]);
    await expect(stranger.mutation(api.resultUploads.remove, { workspaceId: otherId, uploadId })).rejects.toThrow();
  });

  it("saves granted uploads as first-party sources once each", async () => {
    const { t, workspaceId } = await setUp();
    const { uploadId } = await upload(t, workspaceId, GOOGLE);
    const projectId = await t.run((ctx) =>
      ctx.db.insert("researchProjects", {
        workspaceId,
        title: "Austin deep cleaning",
        objective: "What works for us?",
        market: "Deep cleaning",
        geography: "Austin, TX",
        competitors: [],
        platforms: ["web"],
        suppliedUrls: [],
        status: "draft",
        createdBy: "user_owner",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const args = { workspaceId, projectId, agentSlug: "growth-architect" };
    const first = await t.mutation(internal.resultUploads.saveUploadSources, args);
    const second = await t.mutation(internal.resultUploads.saveUploadSources, args);
    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
    const source = await t.run((ctx) => ctx.db.get(first[0]));
    expect(source).toMatchObject({
      origin: "supplied",
      platform: "customerData",
      kind: "dataset",
      availability: "available",
      url: `https://vistrial.io/app/connections/results?upload=${uploadId}`,
    });
    expect(source?.excerpt).toBe(
      "Google Ads from 2026-09-01 to 2026-09-02: spend USD 200, 8,000 impressions, 340 clicks, 12 conversions, revenue USD 2,900.",
    );
    // Another agent with no grant gets nothing.
    expect(await t.mutation(internal.resultUploads.saveUploadSources, { ...args, agentSlug: "brand-studio" })).toEqual([]);
  });
});
