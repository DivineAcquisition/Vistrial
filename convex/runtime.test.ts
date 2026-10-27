/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import { NOT_ALLOWED, NOT_FOUND } from "./lib/errors";
import { INJECTION_FIXTURE, toolsAfterModel } from "./lib/registry";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

function person(subject: string, email: string, extra: Record<string, string | boolean> = {}) {
  return {
    subject,
    email,
    name: email,
    issuer: "https://clerk.vistrial.test",
    tokenIdentifier: `https://clerk.vistrial.test|${subject}`,
    ...extra,
  };
}

async function seedPeople(t: ReturnType<typeof convexTest>) {
  const owner = t.withIdentity(person("owner", "owner@example.com"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Alpha" });
  const managerInvite = await owner.mutation(api.workspace.invite, {
    workspaceId,
    email: "manager@example.com",
    role: "manager",
  });
  const repInvite = await owner.mutation(api.workspace.invite, {
    workspaceId,
    email: "rep@example.com",
    role: "rep",
  });
  const manager = t.withIdentity(person("manager", "manager@example.com"));
  const rep = t.withIdentity(person("rep", "rep@example.com"));
  await manager.mutation(api.workspace.acceptInvite, { token: managerInvite.token });
  await rep.mutation(api.workspace.acceptInvite, { token: repInvite.token });
  return { owner, manager, rep, workspaceId };
}

async function confirmProfile(owner: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>, workspaceId: string) {
  await owner.mutation(api.profile.saveDraft, {
    workspaceId,
    offer: "UNIQUE_OFFER_TOKEN",
    priceNotes: "$12,000",
    audience: "Closers",
    geography: "US",
    channels: "Meta",
    brandVoice: "Direct",
    competitors: [{ name: "Other", url: "https://example.com" }],
  });
  await owner.mutation(api.profile.confirm, { workspaceId });
}

async function finishRun(caller: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>, workspaceId: string, runId: string) {
  let status = "queued";
  for (let i = 0; i < 6; i += 1) {
    status = await caller.action(api.runs.advance, { workspaceId, runId });
    if (status === "completed" || status === "stopped" || status === "failed") break;
  }
  return status;
}

describe("step 4 runtime", () => {
  it("runs the test skill through profile, model, and asset", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seedPeople(t);
    await confirmProfile(owner, workspaceId);
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "sales", skillSlug: "test-echo" });
    expect(await finishRun(owner, workspaceId, runId)).toBe("completed");
    const run = await owner.query(api.runs.get, { workspaceId, runId });
    expect(run.costCents).toBeGreaterThan(0);
    expect(run.steps.map((step: { toolSlug: string | null; kind: string }) => step.kind === "tool" ? step.toolSlug : step.kind)).toEqual([
      "profile.read",
      "model",
      "asset.create",
    ]);
    const assets = await owner.query(api.assets.list, {
      workspaceId,
      status: "draft",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(assets.page).toHaveLength(1);
    const audits = await t.run(async (ctx) =>
      ctx.db.query("auditLog").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).take(30),
    );
    expect(JSON.stringify(audits)).not.toContain(INJECTION_FIXTURE);
    delete process.env.ALLOW_DEV_SKILLS;
  });

  it("hides the test skill when the flag is unset", async () => {
    delete process.env.ALLOW_DEV_SKILLS;
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seedPeople(t);
    expect(await owner.query(api.runs.devSkill, { workspaceId })).toBeNull();
    await expect(
      owner.mutation(api.runs.start, { workspaceId, agentSlug: "sales", skillSlug: "test-echo" }),
    ).rejects.toThrow(NOT_FOUND);
  });

  it("stops at the run cap and the day cap", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seedPeople(t);
    await confirmProfile(owner, workspaceId);
    await t.mutation(internal.staffAdmin.enroll, { userId: "staff", role: "platform_admin" });
    const staff = t.withIdentity(person("staff", "staff@example.com", { secondFactor: true }));
    await staff.mutation(api.platform.setRoute, {
      workKind: "write",
      provider: "fake",
      model: "fake-expensive",
      fallbackProvider: "fake",
      fallbackModel: "fake-writer",
    });
    const expensive = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "sales", skillSlug: "test-echo" });
    expect(await finishRun(owner, workspaceId, expensive)).toBe("stopped");
    expect((await owner.query(api.runs.get, { workspaceId, runId: expensive })).stopReason).toBe("cap");

    await staff.mutation(api.platform.setRoute, {
      workKind: "write",
      provider: "fake",
      model: "fake-writer",
      fallbackProvider: "fake",
      fallbackModel: "fake-writer",
    });
    await t.run(async (ctx) => {
      const day = new Date().toISOString().slice(0, 10);
      const row = await ctx.db
        .query("capCounters")
        .withIndex("by_workspace_agent_day", (q) => q.eq("workspaceId", workspaceId).eq("agentSlug", "sales").eq("day", day))
        .unique();
      if (row) await ctx.db.patch(row._id, { costCents: 200 });
      else await ctx.db.insert("capCounters", { workspaceId, agentSlug: "sales", day, costCents: 200 });
    });
    const capped = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "sales", skillSlug: "test-echo" });
    expect((await owner.query(api.runs.get, { workspaceId, runId: capped })).stopReason).toBe("cap");
    delete process.env.ALLOW_DEV_SKILLS;
  });

  it("stops runs when the workspace is paused or the platform is halted", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seedPeople(t);
    await confirmProfile(owner, workspaceId);
    const queued = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "sales", skillSlug: "test-echo" });
    await owner.mutation(api.controls.setPaused, { workspaceId, paused: true });
    expect((await owner.query(api.runs.get, { workspaceId, runId: queued })).stopReason).toBe("cancelled");
    const paused = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "sales", skillSlug: "test-echo" });
    expect((await owner.query(api.runs.get, { workspaceId, runId: paused })).stopReason).toBe("cancelled");
    await owner.mutation(api.controls.setPaused, { workspaceId, paused: false });

    await t.mutation(internal.staffAdmin.enroll, { userId: "staff", role: "platform_admin" });
    const staff = t.withIdentity(person("staff", "staff@example.com", { secondFactor: true }));
    const again = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "sales", skillSlug: "test-echo" });
    await staff.mutation(api.platform.setHalt, { halted: true });
    expect((await owner.query(api.runs.get, { workspaceId, runId: again })).stopReason).toBe("cancelled");
    const halted = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "sales", skillSlug: "test-echo" });
    expect((await owner.query(api.runs.get, { workspaceId, runId: halted })).stopReason).toBe("cancelled");
    await staff.mutation(api.platform.setHalt, { halted: false });
    delete process.env.ALLOW_DEV_SKILLS;
  });

  it("refuses a tool the skill did not declare", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.runs.applyDeclared, { skillSlug: "test-echo", toolSlug: "asset.addVersion" }),
    ).rejects.toThrow("not declared");
    expect(toolsAfterModel(["profile.read", "test.echo", "asset.create"], INJECTION_FIXTURE)).toEqual([
      "profile.read",
      "test.echo",
      "asset.create",
    ]);
    delete process.env.ALLOW_DEV_SKILLS;
  });

  it("rejects a claim with no evidence and keeps logs free of text", async () => {
    const t = convexTest(schema, modules);
    const { owner, manager, rep, workspaceId } = await seedPeople(t);
    const other = t.withIdentity(person("other", "other@example.com"));
    const otherId = await other.mutation(api.workspace.create, { name: "Beta" });
    await confirmProfile(owner, workspaceId);
    await expect(rep.mutation(api.profile.confirm, { workspaceId })).rejects.toThrow(NOT_ALLOWED);
    expect((await rep.query(api.profile.get, { workspaceId })).confirmed?.offer).toBe("UNIQUE_OFFER_TOKEN");
    await expect(owner.query(api.profile.get, { workspaceId: otherId })).rejects.toThrow(NOT_FOUND);
    await expect(other.query(api.runs.list, { workspaceId, agentSlug: "sales" })).rejects.toThrow(NOT_FOUND);
    const staff = t.withIdentity(person("staff", "staff@example.com", { secondFactor: true }));
    await expect(staff.query(api.profile.get, { workspaceId })).rejects.toThrow(NOT_FOUND);

    await expect(
      owner.mutation(api.runs.start, { workspaceId, agentSlug: "sales", skillSlug: "ad-research" }),
    ).rejects.toThrow("not built yet");
    const audits = await t.run(async (ctx) =>
      ctx.db.query("auditLog").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).take(30),
    );
    const events = await t.run(async (ctx) =>
      ctx.db.query("events").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).take(30),
    );
    const logs = JSON.stringify({ audits, events });
    expect(logs).not.toContain("UNIQUE_OFFER_TOKEN");
    expect(logs).not.toContain(INJECTION_FIXTURE);

    await expect(
      manager.mutation(api.assets.addVersion, {
        workspaceId,
        assetId: (await t.run(async (ctx) => {
          return await ctx.db.insert("assets", {
            workspaceId,
            kind: "researchReport",
            title: "Bare",
            status: "draft",
            currentVersion: 1,
            createdAt: Date.now(),
          });
        })) as never,
        body: "A claim",
        claims: [{ claimKey: "bare", statement: "No source" }],
      }),
    ).rejects.toThrow("evidence");
    const assetId = await t.run(async (ctx) =>
      ctx.db.insert("assets", {
        workspaceId,
        kind: "researchReport",
        title: "Ready",
        status: "draft",
        currentVersion: 1,
        createdAt: Date.now(),
      }),
    );
    await t.run(async (ctx) => {
      const versionId = await ctx.db.insert("assetVersions", {
        workspaceId,
        assetId,
        version: 1,
        body: "Ready",
        createdBy: "person",
      });
      await ctx.db.insert("evidence", {
        workspaceId,
        assetVersionId: versionId,
        claimKey: "ready",
        computed: true,
      });
    });
    await expect(rep.mutation(api.assets.approve, { workspaceId, assetId })).rejects.toThrow(NOT_ALLOWED);
    await manager.mutation(api.assets.approve, { workspaceId, assetId });
    expect((await owner.query(api.assets.get, { workspaceId, assetId })).status).toBe("approved");
    await expect(other.query(api.assets.get, { workspaceId, assetId })).rejects.toThrow(NOT_FOUND);
  });

  it("does not repeat a side effect when a step is retried", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seedPeople(t);
    await confirmProfile(owner, workspaceId);
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "sales", skillSlug: "test-echo" });
    expect(await finishRun(owner, workspaceId, runId)).toBe("completed");
    await owner.action(api.runs.advance, { workspaceId, runId });
    const assets = await owner.query(api.assets.list, {
      workspaceId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(assets.page).toHaveLength(1);
    delete process.env.ALLOW_DEV_SKILLS;
  });

  it("uses the model route from the table", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seedPeople(t);
    await confirmProfile(owner, workspaceId);
    await t.mutation(internal.staffAdmin.enroll, { userId: "staff", role: "platform_admin" });
    const staff = t.withIdentity(person("staff", "staff@example.com", { secondFactor: true }));
    await staff.mutation(api.platform.setRoute, {
      workKind: "write",
      provider: "fake",
      model: "fake-writer-b",
      fallbackProvider: "fake",
      fallbackModel: "fake-writer",
    });
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "sales", skillSlug: "test-echo" });
    await finishRun(owner, workspaceId, runId);
    const run = await owner.query(api.runs.get, { workspaceId, runId });
    expect(run.steps.some((step: { modelRoute: string | null }) => step.modelRoute === "fake/fake-writer-b")).toBe(true);
    delete process.env.ALLOW_DEV_SKILLS;
  });

  it("refuses caps above the platform ceiling", async () => {
    const t = convexTest(schema, modules);
    const { owner, rep, workspaceId } = await seedPeople(t);
    await expect(
      owner.mutation(api.controls.setCaps, {
        workspaceId,
        agentSlug: "sales",
        maxCostCentsPerRun: 101,
        maxCostCentsPerDay: 200,
        maxSteps: 40,
        maxDurationMs: 300000,
      }),
    ).rejects.toThrow("platform ceiling");
    await expect(rep.mutation(api.runs.stop, { workspaceId, runId: "skip" as never })).rejects.toThrow();
  });
});
