/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { startRunFor } from "./runs";
import { NOT_ALLOWED, NOT_FOUND } from "./lib/errors";
import { MISSING_SOURCE } from "./lib/evidence";
import { INJECTION_FIXTURE, toolsAfterModel } from "./lib/registry";
import { resolveRoute } from "./lib/modelChoice";
import type { Needs } from "./lib/models";
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
  const adminInvite = await owner.mutation(api.workspace.invite, {
    workspaceId,
    email: "admin@example.com",
    role: "admin",
  });
  const viewerInvite = await owner.mutation(api.workspace.invite, {
    workspaceId,
    email: "viewer@example.com",
    role: "viewer",
  });
  const admin = t.withIdentity(person("admin", "admin@example.com"));
  const viewer = t.withIdentity(person("viewer", "viewer@example.com"));
  await admin.mutation(api.workspace.acceptInvite, { token: adminInvite.token });
  await viewer.mutation(api.workspace.acceptInvite, { token: viewerInvite.token });
  // Runs only start while the agent is on.
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: "growth-architect", state: "on" });
  return { owner, admin, viewer, workspaceId };
}

async function confirmProfile(owner: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>, workspaceId: Id<"workspaces">) {
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

/** Runs are driven by the scheduler, not the browser. Run the steps that are due now, one round at a time; the time-cap stop stays in the future. */
async function finishRun(
  t: ReturnType<typeof convexTest>,
  caller: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
  workspaceId: Id<"workspaces">,
  runId: Id<"agentRuns">,
) {
  let status = "queued";
  for (let i = 0; i < 20 && (status === "queued" || status === "running"); i += 1) {
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
    status = (await caller.query(api.runs.get, { workspaceId, runId })).status as string;
  }
  return status;
}

/** The model each step used, read straight from the table. Only staff screens may show these. */
function makeTester() {
  return convexTest(schema, modules);
}

async function modelRoutes(t: ReturnType<typeof makeTester>, workspaceId: string, runId: string) {
  const steps = await t.run(async (ctx) =>
    ctx.db
      .query("runSteps")
      .withIndex("by_workspace_run", (q) => q.eq("workspaceId", workspaceId as never).eq("runId", runId as never))
      .take(50),
  );
  return steps.map((step) => step.modelRoute ?? null);
}

describe("step 4 runtime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.ALLOW_DEV_SKILLS;
  });

  it("runs the test skill through profile, model, and asset", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seedPeople(t);
    await confirmProfile(owner, workspaceId);
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    expect(await finishRun(t, owner, workspaceId, runId)).toBe("completed");
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
      owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" }),
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
    const expensive = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    expect(await finishRun(t, owner, workspaceId, expensive)).toBe("stopped");
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
        .withIndex("by_workspace_agent_day", (q) => q.eq("workspaceId", workspaceId).eq("agentSlug", "growth-architect").eq("day", day))
        .unique();
      if (row) await ctx.db.patch(row._id, { costCents: 200 });
      else await ctx.db.insert("capCounters", { workspaceId, agentSlug: "growth-architect", day, costCents: 200 });
    });
    const capped = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    expect((await owner.query(api.runs.get, { workspaceId, runId: capped })).stopReason).toBe("cap");
    delete process.env.ALLOW_DEV_SKILLS;
  });

  it("stops runs when the workspace is paused or the platform is halted", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seedPeople(t);
    await confirmProfile(owner, workspaceId);
    const queued = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    await owner.mutation(api.controls.setPaused, { workspaceId, paused: true });
    expect((await owner.query(api.runs.get, { workspaceId, runId: queued })).stopReason).toBe("cancelled");
    const paused = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    expect((await owner.query(api.runs.get, { workspaceId, runId: paused })).stopReason).toBe("cancelled");
    await owner.mutation(api.controls.setPaused, { workspaceId, paused: false });

    await t.mutation(internal.staffAdmin.enroll, { userId: "staff", role: "platform_admin" });
    const staff = t.withIdentity(person("staff", "staff@example.com", { secondFactor: true }));
    const again = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    await staff.mutation(api.platform.setHalt, { halted: true });
    expect((await owner.query(api.runs.get, { workspaceId, runId: again })).stopReason).toBe("cancelled");
    const halted = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
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
    const { owner, admin, viewer, workspaceId } = await seedPeople(t);
    const other = t.withIdentity(person("other", "other@example.com"));
    const otherId = await other.mutation(api.workspace.create, { name: "Beta" });
    await confirmProfile(owner, workspaceId);
    await expect(viewer.mutation(api.profile.confirm, { workspaceId })).rejects.toThrow(NOT_ALLOWED);
    expect((await viewer.query(api.profile.get, { workspaceId })).confirmed?.offer).toBe("UNIQUE_OFFER_TOKEN");
    await expect(owner.query(api.profile.get, { workspaceId: otherId })).rejects.toThrow(NOT_FOUND);
    await expect(other.query(api.runs.list, { workspaceId, agentSlug: "growth-architect" })).rejects.toThrow(NOT_FOUND);
    const staff = t.withIdentity(person("staff", "staff@example.com", { secondFactor: true }));
    await expect(staff.query(api.profile.get, { workspaceId })).rejects.toThrow(NOT_FOUND);

    await expect(
      owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "ad-research" }),
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
      admin.mutation(api.assets.addVersion, {
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
    await expect(viewer.mutation(api.assets.approve, { workspaceId, assetId })).rejects.toThrow(NOT_ALLOWED);
    await admin.mutation(api.assets.approve, { workspaceId, assetId });
    expect((await owner.query(api.assets.get, { workspaceId, assetId })).status).toBe("approved");
    await expect(other.query(api.assets.get, { workspaceId, assetId })).rejects.toThrow(NOT_FOUND);
  });

  it("does not repeat a side effect when a step is retried", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seedPeople(t);
    await confirmProfile(owner, workspaceId);
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    expect(await finishRun(t, owner, workspaceId, runId)).toBe("completed");
    // Replaying the asset step with the same key changes nothing.
    await t.mutation(internal.runs.commitTool, {
      runId: runId as never,
      idempotencyKey: `${runId}:2`,
      index: 2,
      toolSlug: "asset.create",
    });
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
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    await finishRun(t, owner, workspaceId, runId);
    expect(await modelRoutes(t, workspaceId, runId)).toContain("fake/fake-writer-b");
    // Workspace screens get the kind of work, never the model name.
    const run = await owner.query(api.runs.get, { workspaceId, runId });
    expect(JSON.stringify(run)).not.toContain("fake-writer-b");
    expect(run.steps.some((step: { workKind: string | null }) => step.workKind === "write")).toBe(true);
    delete process.env.ALLOW_DEV_SKILLS;
  });

  it("refuses caps above the platform ceiling", async () => {
    const t = convexTest(schema, modules);
    const { owner, viewer, workspaceId } = await seedPeople(t);
    await expect(
      owner.mutation(api.controls.setCaps, {
        workspaceId,
        agentSlug: "growth-architect",
        // The ceiling is $10 a run since decision D3 (it was $1).
        maxCostCentsPerRun: 1001,
        maxCostCentsPerDay: 200,
        maxSteps: 40,
        maxDurationMs: 300000,
      }),
    ).rejects.toThrow("platform ceiling");
    await expect(viewer.mutation(api.runs.stop, { workspaceId, runId: "skip" as never })).rejects.toThrow();
  });

  it("records a model call that lands after a pause, then stops the run", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seedPeople(t);
    await confirmProfile(owner, workspaceId);
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    // Pause lands while the model call is out: write the flag directly so the open run is not cancelled first.
    await t.run(async (ctx) => {
      await ctx.db.insert("workspaceControls", { workspaceId, agentsPaused: true });
    });
    const saved = await t.mutation(internal.runs.commitModel, {
      runId: runId as never,
      idempotencyKey: `${runId}:1`,
      index: 1,
      text: "x",
      inputTokens: 1,
      outputTokens: 1,
      costCents: 3,
      provider: "fake",
      model: "fake-writer",
    });
    expect(saved.status).toBe("stopped");
    const run = await owner.query(api.runs.get, { workspaceId, runId });
    expect(run.stopReason).toBe("cancelled");
    expect(run.costCents).toBe(3);
  });

  it("counts the cost of a call that crosses the cap", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seedPeople(t);
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    await t.run(async (ctx) => {
      await ctx.db.patch(runId, { costCents: 25 });
    });
    await t.mutation(internal.runs.commitModel, {
      runId: runId as never,
      idempotencyKey: `${runId}:1`,
      index: 1,
      text: "x",
      inputTokens: 1,
      outputTokens: 1,
      costCents: 7,
      provider: "fake",
      model: "fake-writer",
    });
    const counters = await t.run(async (ctx) =>
      ctx.db.query("capCounters").withIndex("by_workspace_agent_day", (q) => q.eq("workspaceId", workspaceId)).take(5),
    );
    expect(counters.map((row) => row.costCents)).toEqual([7]);
    const run = await owner.query(api.runs.get, { workspaceId, runId });
    expect(run.costCents).toBe(32);
    expect(run.stopReason).toBe("cap");
  });

  it("lists the newest runs first", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seedPeople(t);
    let last = "";
    for (let i = 0; i < 21; i += 1) {
      last = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    }
    const list = await owner.query(api.runs.list, { workspaceId, agentSlug: "growth-architect" });
    expect(list).toHaveLength(20);
    expect(list[0].id).toBe(last);
  });

  it("lets only an Owner or Admin start a run", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { admin, viewer, workspaceId } = await seedPeople(t);
    await expect(
      viewer.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" }),
    ).rejects.toThrow(NOT_ALLOWED);
    await admin.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
  });

  it("fails the run when no profile is confirmed, and rejects a made-up source", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, admin, workspaceId } = await seedPeople(t);
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    expect(await finishRun(t, owner, workspaceId, runId)).toBe("failed");
    const run = await owner.query(api.runs.get, { workspaceId, runId });
    expect(run.steps[0].resultCode).toBe("no_confirmed_profile");
    const assetId = await t.run(async (ctx) =>
      ctx.db.insert("assets", {
        workspaceId,
        kind: "researchReport",
        title: "Sourced",
        status: "draft",
        currentVersion: 1,
        createdAt: Date.now(),
      }),
    );
    await expect(
      admin.mutation(api.assets.addVersion, {
        workspaceId,
        assetId,
        body: "A claim",
        claims: [{ claimKey: "a", statement: "s", sourceId: "none", fetchedAt: Date.now() }],
      }),
    ).rejects.toThrow("evidence");
  });

  it("sends an edited approved asset back for approval", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, admin, workspaceId } = await seedPeople(t);
    await confirmProfile(owner, workspaceId);
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    await finishRun(t, owner, workspaceId, runId);
    const assets = await owner.query(api.assets.list, { workspaceId, paginationOpts: { numItems: 5, cursor: null } });
    const assetId = assets.page[0].id;
    await owner.mutation(api.assets.approve, { workspaceId, assetId });
    await admin.mutation(api.assets.addVersion, {
      workspaceId,
      assetId,
      body: "Changed",
      claims: [{ claimKey: "a", statement: "s", computed: true }],
    });
    const asset = await owner.query(api.assets.get, { workspaceId, assetId });
    expect(asset.status).toBe("draft");
    expect(asset.body).toBe("Changed");
  });

  it("moves to the fallback model when the main one fails", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seedPeople(t);
    await confirmProfile(owner, workspaceId);
    await t.mutation(internal.staffAdmin.enroll, { userId: "staff", role: "platform_admin" });
    const staff = t.withIdentity(person("staff", "staff@example.com", { secondFactor: true }));
    await staff.mutation(api.platform.setRoute, {
      workKind: "write",
      provider: "fake",
      model: "fake-failing",
      fallbackProvider: "fake",
      fallbackModel: "fake-writer",
    });
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    expect(await finishRun(t, owner, workspaceId, runId)).toBe("completed");
    expect(await modelRoutes(t, workspaceId, runId)).toContain("fake/fake-writer");
  });

  it("runs a step on OpenRouter when a route names it, records the model, and charges the reported cost", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    delete process.env.OPENROUTER_API_KEY;
    const sent: Record<string, unknown>[] = [];
    (globalThis as { __vistrialScriptedOpenRouter?: unknown }).__vistrialScriptedOpenRouter = (body: Record<string, unknown>) => {
      sent.push(body);
      return {
        status: 200,
        body: { id: "gen-1", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text: "ok", citations: null }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 50, output_tokens: 10, server_tool_use: null, cost: 0.02 } },
      };
    };
    try {
      const t = convexTest(schema, modules);
      const { owner, workspaceId } = await seedPeople(t);
      await confirmProfile(owner, workspaceId);
      await t.mutation(internal.staffAdmin.enroll, { userId: "staff", role: "platform_admin" });
      const staff = t.withIdentity(person("staff", "staff@example.com", { secondFactor: true }));
      await staff.mutation(api.platform.setRoute, { workKind: "write", provider: "openrouter", model: "openai/gpt-6.1-sol", fallbackProvider: "openrouter", fallbackModel: "openai/gpt-6.1-terra" });
      const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
      expect(await finishRun(t, owner, workspaceId, runId)).toBe("completed");
      expect(await modelRoutes(t, workspaceId, runId)).toContain("openrouter/openai/gpt-6.1-sol");
      expect(sent).toHaveLength(1);
      expect(sent[0].provider).toEqual({ data_collection: "deny", zdr: true, require_parameters: true });
      const run = await t.run((ctx) => ctx.db.get(runId));
      // $0.02 reported is 2 cents: the run carries what OpenRouter said, not a table price.
      expect(run?.costCents).toBeCloseTo(2 * 1.055, 4);
    } finally {
      delete (globalThis as { __vistrialScriptedOpenRouter?: unknown }).__vistrialScriptedOpenRouter;
    }
  });

  it("fails the run with no_key, and spends nothing, when a route names OpenRouter and no key is set", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    delete process.env.OPENROUTER_API_KEY;
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seedPeople(t);
    await confirmProfile(owner, workspaceId);
    await t.mutation(internal.staffAdmin.enroll, { userId: "staff", role: "platform_admin" });
    const staff = t.withIdentity(person("staff", "staff@example.com", { secondFactor: true }));
    await staff.mutation(api.platform.setRoute, { workKind: "write", provider: "openrouter", model: "openai/gpt-6.1-sol", fallbackProvider: "openrouter", fallbackModel: "openai/gpt-6.1-terra" });
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    expect(await finishRun(t, owner, workspaceId, runId)).toBe("failed");
    const steps = await t.run((ctx) => ctx.db.query("runSteps").withIndex("by_workspace_run", (q) => q.eq("workspaceId", workspaceId).eq("runId", runId)).take(10));
    expect(steps.map((step) => step.resultCode)).toContain("no_key");
    expect((await t.run((ctx) => ctx.db.get(runId)))?.costCents).toBe(0);
  });

  it("never points a route at a model that has no price", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.staffAdmin.enroll, { userId: "admin", role: "platform_admin" });
    const admin = t.withIdentity(person("admin", "admin@example.com", { secondFactor: true }));
    const route = { workKind: "write", provider: "openrouter", model: "openai/gpt-6.1-sol", fallbackProvider: "claude", fallbackModel: "claude-sonnet-5-5" };
    await admin.mutation(api.platform.setRoute, route);
    await expect(admin.mutation(api.platform.setRoute, { ...route, model: "openai/gpt-7" })).rejects.toThrow("has no price set");
    await expect(admin.mutation(api.platform.setRoute, { ...route, fallbackModel: "claude-opus-9" })).rejects.toThrow("has no price set");
    await expect(admin.mutation(api.platform.setRoute, { ...route, provider: "claude" })).rejects.toThrow("Anthropic's own model ids");
  });

  it("resolves a chosen model to its route only where it can run, and otherwise keeps the platform's", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.platform.ensureDefaultRoutes, {});
    const opus = { provider: "claude", model: "claude-opus-5-5", fallbackProvider: "claude", fallbackModel: "claude-sonnet-5-5" };
    const sol = "openai/gpt-6.1-sol";
    const carbon = "google/gemini-4-carbon";
    const resolve = (choice: string | undefined, needs: Needs = {}) => t.run((ctx) => resolveRoute(ctx, "research", choice, needs));
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.MODEL_FAMILIES;
    delete process.env.OPENROUTER_WEB_SEARCH;
    try {
      expect(await resolve(undefined)).toEqual({ route: opus });
      expect(await resolve("claude-opus-5-5", { webSearch: true })).toEqual({ route: opus });
      expect(await resolve("not-a-model")).toEqual({ route: opus });
      // Another Claude model needs no switch: it runs at Anthropic, like the platform's own.
      expect((await resolve("claude-sonnet-5-5", { webSearch: true, webFetch: true })).route).toEqual({ provider: "claude", model: "claude-sonnet-5-5", fallbackProvider: "claude", fallbackModel: "claude-opus-5-5" });
      // No key, or the owner has not switched the family on: the platform's route runs, and the answer says why.
      expect(await resolve(sol)).toEqual({ route: opus, setAside: { model: sol, family: "gpt", reason: "not_switched_on" } });
      process.env.OPENROUTER_API_KEY = "test-key";
      expect(await resolve(sol)).toEqual({ route: opus, setAside: { model: sol, family: "gpt", reason: "not_switched_on" } });
      process.env.MODEL_FAMILIES = "gpt, Gemini";
      expect((await resolve(sol)).route).toEqual({ provider: "openrouter", model: sol, fallbackProvider: "openrouter", fallbackModel: "openai/gpt-6.1-terra" });
      // A family name from an older record still means that family's usual model.
      expect((await resolve("gpt")).route?.model).toBe(sol);
      expect((await resolve("openai/gpt-6-astra")).route?.model).toBe("openai/gpt-6-astra");
      expect((await resolve(carbon)).route?.model).toBe(carbon);
      expect(await resolve(carbon, { webSearch: true })).toEqual({ route: opus, setAside: { model: carbon, family: "gemini", reason: "no_web_search" } });
      process.env.OPENROUTER_WEB_SEARCH = "on";
      expect((await resolve(carbon, { webSearch: true })).route?.provider).toBe("openrouter");
      expect(await resolve(sol, { webFetch: true })).toEqual({ route: opus, setAside: { model: sol, family: "gpt", reason: "no_web_fetch" } });
    } finally {
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.MODEL_FAMILIES;
      delete process.env.OPENROUTER_WEB_SEARCH;
    }
  });

  describe("choosing a model", () => {
    const reply = (body: Record<string, unknown>) => ({
      status: 200,
      body: { id: "gen-1", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text: "ok", citations: null }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 50, output_tokens: 10, server_tool_use: null, cost: 0.01 } },
    });
    const hook = globalThis as { __vistrialScriptedOpenRouter?: unknown };
    const on = () => {
      process.env.ALLOW_DEV_SKILLS = "true";
      // Offered, but with no real key: the scripted replies stand in for the network.
      process.env.MODEL_FAMILIES = "gpt,gemini";
      hook.__vistrialScriptedOpenRouter = reply;
    };
    afterEach(() => {
      delete hook.__vistrialScriptedOpenRouter;
      delete process.env.MODEL_FAMILIES;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.OPENROUTER_WEB_SEARCH;
      delete process.env.CLAUDE_HAIKU_WEB;
    });

    it("refuses a family that is not switched on, before anything starts", async () => {
      process.env.ALLOW_DEV_SKILLS = "true";
      const t = convexTest(schema, modules);
      const { owner, workspaceId } = await seedPeople(t);
      await confirmProfile(owner, workspaceId);
      await expect(owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo", model: "openai/gpt-6.1-sol" })).rejects.toThrow("GPT-6.1 Sol cannot run this: not switched on yet");
      await expect(owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo", model: "llama" })).rejects.toThrow("not one you can choose");
      expect(await t.run((ctx) => ctx.db.query("agentRuns").take(5))).toHaveLength(0);
    });

    it("stores the model picked on the run, and its steps are routed to that model", async () => {
      on();
      process.env.OPENROUTER_API_KEY = "test-key";
      const t = convexTest(schema, modules);
      const { owner, workspaceId } = await seedPeople(t);
      await confirmProfile(owner, workspaceId);
      const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo", model: "openai/gpt-6.1-sol" });
      expect((await t.run((ctx) => ctx.db.get(runId)))?.modelChoice).toBe("openai/gpt-6.1-sol");
      // The first step is a tool. Commit it, then the model step's plan names the family's route.
      const first = await t.mutation(internal.runs.prepare, { runId });
      if (first.done || first.kind !== "tool") throw new Error("expected a tool step");
      await t.mutation(internal.runs.commitTool, { runId, idempotencyKey: first.idempotencyKey, index: first.index, toolSlug: first.toolSlug });
      const second = await t.mutation(internal.runs.prepare, { runId });
      expect(second).toMatchObject({ kind: "model", route: { provider: "openrouter", model: "openai/gpt-6.1-sol", fallbackProvider: "openrouter", fallbackModel: "openai/gpt-6.1-terra" } });
    });

    it("lists only the models that can do the work, and none that cannot", async () => {
      process.env.ALLOW_DEV_SKILLS = "true";
      const t = convexTest(schema, modules);
      const { owner, viewer, workspaceId } = await seedPeople(t);
      await t.mutation(internal.platform.ensureDefaultRoutes, {});
      const ids = async (skillSlug?: string) => (await owner.query(api.models.options, { workspaceId, ...(skillSlug ? { skillSlug } : {}) })).models.map((row) => row.id);
      const claude = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"];
      // Nothing switched on: Claude only.
      expect(await ids()).toEqual(claude);
      on();
      process.env.OPENROUTER_API_KEY = "test-key";
      const all = await owner.query(api.models.options, { workspaceId });
      expect(all.models.map((row) => row.id)).toEqual([
        ...claude,
        "openai/gpt-6-astra",
        "openai/gpt-6.1-sol",
        "openai/gpt-6.1-terra",
        "openai/gpt-6-luna",
        "google/gemini-4-argon",
        "google/gemini-4-carbon",
        "google/gemini-4-hydrogen",
        "google/gemini-3.8-flash",
      ]);
      expect(all.current).toBe("claude-opus-5-5");
      expect(all.canChoose).toBe(true);
      expect((await viewer.query(api.models.options, { workspaceId })).canChoose).toBe(false);
      const row = (id: string) => all.models.find((model) => model.id === id);
      // The platform's own model says nothing about cost. A dearer one says so and raises the limit.
      expect(row("claude-opus-5-5")).toMatchObject({ cost: null, capScale: 1, fastName: "Claude Sonnet 5.5" });
      expect(row("openai/gpt-6-astra")).toMatchObject({ cost: "Usually costs more", capScale: 2.5, fastCapScale: 1, fastName: "GPT-6.1 Terra" });
      expect(row("openai/gpt-6.1-sol")).toMatchObject({ cost: "Usually costs less", capScale: 1 });
      // Research searches the web, which is not proven through OpenRouter yet: those models are not listed.
      // Claude Haiku 5.5 is not proven to search the web through the router's tools either, so it waits too.
      const proven = ["claude-opus-5-5", "claude-sonnet-5-5"];
      expect(await ids("market-intelligence")).toEqual(proven);
      process.env.OPENROUTER_WEB_SEARCH = "on";
      expect(await ids("market-intelligence")).toHaveLength(10);
      expect(await ids("market-intelligence")).not.toContain("claude-haiku-5-5");
      process.env.CLAUDE_HAIKU_WEB = "on";
      expect(await ids("market-intelligence")).toHaveLength(11);
    });

    it("remembers each person's last choice per kind of work, and nobody else's", async () => {
      on();
      process.env.OPENROUTER_API_KEY = "test-key";
      const t = convexTest(schema, modules);
      const { owner, admin, workspaceId } = await seedPeople(t);
      await confirmProfile(owner, workspaceId);
      const start = (who: typeof owner, model?: string) => who.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo", ...(model ? { model } : {}) });
      const choiceOf = async (runId: Id<"agentRuns">) => (await t.run((ctx) => ctx.db.get(runId)))?.modelChoice;
      // Never chose: nothing is stored and the platform's route runs.
      expect(await choiceOf(await start(owner))).toBeUndefined();
      await start(owner, "google/gemini-4-carbon");
      expect((await owner.query(api.models.options, { workspaceId })).current).toBe("google/gemini-4-carbon");
      expect(await choiceOf(await start(owner))).toBe("google/gemini-4-carbon");
      // Another person in the same organization is not affected.
      expect((await admin.query(api.models.options, { workspaceId })).current).not.toBe("google/gemini-4-carbon");
      expect(await choiceOf(await start(admin))).toBeUndefined();
      // A choice made for writing is not carried into research, which is another kind of work.
      expect((await owner.query(api.models.options, { workspaceId, skillSlug: "market-intelligence" })).current).not.toBe("google/gemini-4-carbon");
      // If the family is switched off later, the remembered choice stops applying and nothing is refused.
      process.env.MODEL_FAMILIES = "gpt";
      expect(await choiceOf(await start(owner))).toBeUndefined();
    });

    it("leaves work nobody starts by hand on the platform's route, whatever its owner last chose", async () => {
      on();
      process.env.OPENROUTER_API_KEY = "test-key";
      const t = convexTest(schema, modules);
      const { owner, workspaceId } = await seedPeople(t);
      await confirmProfile(owner, workspaceId);
      await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo", model: "openai/gpt-6.1-sol" });
      const runId = await t.run((ctx) => startRunFor(ctx, { workspaceId, userId: "owner", role: "owner", agentSlug: "growth-architect", skillSlug: "test-echo", unattended: true }));
      expect((await t.run((ctx) => ctx.db.get(runId)))?.modelChoice).toBeUndefined();
    });

    it("lets a run on a dearer model spend more, in step with its price, and judges the spending limit against that", async () => {
      on();
      process.env.OPENROUTER_API_KEY = "test-key";
      const t = convexTest(schema, modules);
      const { owner, workspaceId } = await seedPeople(t);
      await confirmProfile(owner, workspaceId);
      const capOf = async (runId: Id<"agentRuns">) => (await owner.query(api.runs.get, { workspaceId, runId })).caps.maxCostCentsPerRun;
      const plain = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
      const base = await capOf(plain);
      const cheap = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo", model: "openai/gpt-6-luna" });
      expect(await capOf(cheap)).toBe(base);
      const dear = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo", model: "openai/gpt-6-astra" });
      expect(await capOf(dear)).toBe(Math.ceil(base * 2.5));
    });

    it("shows which model ran: on the run, on each model step, and on what the run made", async () => {
      process.env.ALLOW_DEV_SKILLS = "true";
      const t = convexTest(schema, modules);
      const { owner, workspaceId } = await seedPeople(t);
      await confirmProfile(owner, workspaceId);
      await t.mutation(internal.staffAdmin.enroll, { userId: "staff", role: "platform_admin" });
      const staff = t.withIdentity(person("staff", "staff@example.com", { secondFactor: true }));
      delete process.env.OPENROUTER_API_KEY;
      hook.__vistrialScriptedOpenRouter = reply;
      await staff.mutation(api.platform.setRoute, { workKind: "write", provider: "openrouter", model: "google/gemini-4-carbon", fallbackProvider: "openrouter", fallbackModel: "google/gemini-4-hydrogen" });
      const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
      expect(await finishRun(t, owner, workspaceId, runId)).toBe("completed");
      const run = await owner.query(api.runs.get, { workspaceId, runId });
      expect(run.model).toEqual({ family: "gemini", name: "Gemini 4 Carbon" });
      expect(run.steps.filter((step) => step.kind === "model").map((step) => step.model)).toEqual([{ family: "gemini", name: "Gemini 4 Carbon" }]);
      expect(run.steps.filter((step) => step.kind !== "model").every((step) => step.model === null)).toBe(true);
      const asset = await owner.query(api.assets.get, { workspaceId, assetId: run.assets[0].id });
      expect(asset.model).toEqual({ family: "gemini", name: "Gemini 4 Carbon" });
    });

    it("shows nothing for a run made by a model with no known name, and for older runs", async () => {
      process.env.ALLOW_DEV_SKILLS = "true";
      const t = convexTest(schema, modules);
      const { owner, workspaceId } = await seedPeople(t);
      await confirmProfile(owner, workspaceId);
      const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
      expect(await finishRun(t, owner, workspaceId, runId)).toBe("completed");
      // The fake model ran. It is recorded, and no mark is shown for it.
      expect((await t.run((ctx) => ctx.db.get(runId)))?.madeWith).toEqual({ provider: "fake", model: "fake-writer" });
      expect((await owner.query(api.runs.get, { workspaceId, runId })).model).toBeNull();
      await t.run((ctx) => ctx.db.patch(runId, { madeWith: undefined }));
      expect((await owner.query(api.runs.get, { workspaceId, runId })).model).toBeNull();
    });

    it("a chat carries the model picked, and refuses one that cannot do the chat's work", async () => {
      on();
      process.env.OPENROUTER_API_KEY = "test-key";
      const t = convexTest(schema, modules);
      const { owner, viewer, workspaceId } = await seedPeople(t);
      await confirmProfile(owner, workspaceId);
      await expect(owner.mutation(api.agentChat.send, { workspaceId, text: "Research my market", skill: "market-intelligence", model: "openai/gpt-6.1-sol" })).rejects.toThrow("GPT-6.1 Sol cannot run this: cannot search the web here yet");
      const { intakeId } = await owner.mutation(api.agentChat.send, { workspaceId, text: "Is my retainer priced right?", skill: "offer-intelligence", model: "openai/gpt-6.1-sol" });
      expect((await owner.query(api.agentChat.get, { workspaceId, intakeId })).model).toBe("openai/gpt-6.1-sol");
      await owner.mutation(api.agentChat.setModel, { workspaceId, intakeId, model: "google/gemini-4-argon" });
      expect((await owner.query(api.agentChat.get, { workspaceId, intakeId })).model).toBe("google/gemini-4-argon");
      await expect(viewer.mutation(api.agentChat.setModel, { workspaceId, intakeId, model: "claude-opus-5-5" })).rejects.toThrow();
      // The pick is remembered as this person's choice for this kind of work.
      expect((await owner.query(api.models.options, { workspaceId, skillSlug: "offer-intelligence" })).current).toBe("google/gemini-4-argon");
      // A chat with no pick of its own stores none: it starts on whatever the person last chose.
      const plain = await owner.mutation(api.agentChat.send, { workspaceId, text: "Is my retainer priced right?", skill: "offer-intelligence" });
      expect((await owner.query(api.agentChat.get, { workspaceId, intakeId: plain.intakeId })).model).toBeNull();
    });
  });

  it("lets only a Platform Admin change model routes", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.staffAdmin.enroll, { userId: "service", role: "service_team" });
    const service = t.withIdentity(person("service", "service@example.com", { secondFactor: true }));
    const route = { workKind: "write", provider: "fake", model: "x", fallbackProvider: "fake", fallbackModel: "x" };
    await expect(service.mutation(api.platform.setRoute, route)).rejects.toThrow(NOT_ALLOWED);
    await t.mutation(internal.staffAdmin.enroll, { userId: "admin", role: "platform_admin" });
    const platformAdmin = t.withIdentity(person("admin", "admin@example.com", { secondFactor: true }));
    await expect(platformAdmin.mutation(api.platform.setRoute, { ...route, workKind: "anything" })).rejects.toThrow("Unknown kind");
    await expect(platformAdmin.mutation(api.platform.setRoute, { ...route, provider: "other" })).rejects.toThrow("Unknown provider");
  });

  it("returns artifact bodies only through the checked query", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seedPeople(t);
    await confirmProfile(owner, workspaceId);
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    await finishRun(t, owner, workspaceId, runId);
    const run = await owner.query(api.runs.get, { workspaceId, runId });
    expect(JSON.stringify(run)).not.toContain("UNTRUSTED CONTENT");
    expect(run.artifacts.length).toBeGreaterThan(0);
    const body = await owner.query(api.runs.artifact, { workspaceId, artifactId: run.artifacts[0].id });
    expect(typeof body.body).toBe("string");
    const other = t.withIdentity(person("other", "other@example.com"));
    const otherId = await other.mutation(api.workspace.create, { name: "Beta" });
    await expect(
      other.query(api.runs.artifact, { workspaceId: otherId, artifactId: run.artifacts[0].id }),
    ).rejects.toThrow(NOT_FOUND);
  });

  it("refuses on the server to approve a version whose source is missing", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, admin, workspaceId } = await seedPeople(t);
    await confirmProfile(owner, workspaceId);
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    expect(await finishRun(t, owner, workspaceId, runId)).toBe("completed");
    const assetId = (await owner.query(api.runs.get, { workspaceId, runId })).assets[0].id;

    // The run cited the confirmed profile. Remove that record, as a data deletion would.
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("profileVersions")
        .withIndex("by_workspace_version", (q) => q.eq("workspaceId", workspaceId))
        .take(10);
      for (const row of rows) await ctx.db.delete(row._id);
    });
    // The screen would block this. Calling the mutation directly must be refused too.
    await expect(admin.mutation(api.assets.approve, { workspaceId, assetId })).rejects.toThrow(MISSING_SOURCE);
    await expect(owner.mutation(api.assets.approve, { workspaceId, assetId })).rejects.toThrow(MISSING_SOURCE);
    expect((await owner.query(api.assets.get, { workspaceId, assetId })).status).toBe("draft");

    // A source from another workspace counts as missing, even though the record exists.
    const other = t.withIdentity(person("other", "other@example.com"));
    const otherId = await other.mutation(api.workspace.create, { name: "Beta" });
    await confirmProfile(other, otherId);
    const otherProfile = await t.run(async (ctx) =>
      ctx.db
        .query("profileVersions")
        .withIndex("by_workspace_version", (q) => q.eq("workspaceId", otherId))
        .first(),
    );
    const crossId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("assets", {
        workspaceId,
        kind: "researchReport",
        title: "Cross",
        status: "draft",
        currentVersion: 1,
        createdAt: Date.now(),
      });
      const versionId = await ctx.db.insert("assetVersions", { workspaceId, assetId: id, version: 1, body: "x", createdBy: "agent" });
      await ctx.db.insert("evidence", {
        workspaceId,
        assetVersionId: versionId,
        claimKey: "cross",
        statement: "s",
        sourceId: otherProfile!._id,
        fetchedAt: Date.now(),
      });
      return id;
    });
    await expect(owner.mutation(api.assets.approve, { workspaceId, assetId: crossId })).rejects.toThrow(MISSING_SOURCE);

    // Only the version being approved is checked: a fixed new version with a computed claim goes through.
    await admin.mutation(api.assets.addVersion, {
      workspaceId,
      assetId,
      body: "Fixed",
      claims: [{ claimKey: "count", statement: "Computed from the run", computed: true }],
    });
    await owner.mutation(api.assets.approve, { workspaceId, assetId });
    expect((await owner.query(api.assets.get, { workspaceId, assetId })).status).toBe("approved");
  });

  it("counts a refused model call that was billed, and fails the run", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seedPeople(t);
    await confirmProfile(owner, workspaceId);
    await t.mutation(internal.staffAdmin.enroll, { userId: "staff", role: "platform_admin" });
    const staff = t.withIdentity(person("staff", "staff@example.com", { secondFactor: true }));
    await staff.mutation(api.platform.setRoute, {
      workKind: "write",
      provider: "fake",
      model: "fake-refusing",
      fallbackProvider: "fake",
      fallbackModel: "fake-refusing",
    });
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    expect(await finishRun(t, owner, workspaceId, runId)).toBe("failed");
    const run = await owner.query(api.runs.get, { workspaceId, runId });
    expect(run.stopReason).toBe("error");
    expect(run.costCents).toBe(2);
    expect([run.inputTokens, run.outputTokens]).toEqual([10, 2]);
    const failed = run.steps.find((step: { kind: string }) => step.kind === "model");
    expect(failed).toMatchObject({ status: "failed", resultCode: "refused", inputTokens: 10, outputTokens: 2 });
    expect(run.daySpentCents).toBe(2);
    expect(run.assets).toHaveLength(0);
  });

  it("adds a refused call's cost to the fallback's answer", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seedPeople(t);
    await confirmProfile(owner, workspaceId);
    await t.mutation(internal.staffAdmin.enroll, { userId: "staff", role: "platform_admin" });
    const staff = t.withIdentity(person("staff", "staff@example.com", { secondFactor: true }));
    await staff.mutation(api.platform.setRoute, {
      workKind: "write",
      provider: "fake",
      model: "fake-refusing",
      fallbackProvider: "fake",
      fallbackModel: "fake-writer",
    });
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    expect(await finishRun(t, owner, workspaceId, runId)).toBe("completed");
    const run = await owner.query(api.runs.get, { workspaceId, runId });
    // 2 cents for the refusal plus 1 cent for the answer.
    expect(run.costCents).toBe(3);
    expect(run.daySpentCents).toBe(3);
    expect(await modelRoutes(t, workspaceId, runId)).toContain("fake/fake-writer");
  });

  it("counts a refused call that lands after Stop, once", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seedPeople(t);
    await confirmProfile(owner, workspaceId);
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    await owner.mutation(api.runs.stop, { workspaceId, runId });
    const refused = {
      runId: runId as never,
      index: 1,
      idempotencyKey: `${runId}:1`,
      code: "refused",
      kind: "model" as const,
      inputTokens: 40,
      outputTokens: 3,
      costCents: 0.5,
    };
    await t.mutation(internal.runs.fail, refused);
    await t.mutation(internal.runs.fail, refused);
    const run = await owner.query(api.runs.get, { workspaceId, runId });
    expect(run.status).toBe("stopped");
    expect(run.stopReason).toBe("halted");
    expect(run.costCents).toBe(0.5);
    expect(run.daySpentCents).toBe(0.5);
    expect(run.steps).toHaveLength(1);
  });

  it("does not start a run while the agent is off", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, admin, workspaceId } = await seedPeople(t);
    await confirmProfile(owner, workspaceId);
    await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: "growth-architect", state: "off" });
    await expect(
      admin.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" }),
    ).rejects.toThrow("Turn on the Strategist first.");
    expect((await owner.query(api.runs.page, { workspaceId, paginationOpts: { numItems: 5, cursor: null } })).page).toHaveLength(0);
    await expect(
      admin.mutation(api.runs.start, { workspaceId, agentSlug: "nobody", skillSlug: "test-echo" }),
    ).rejects.toThrow(NOT_FOUND);
    await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: "growth-architect", state: "suggesting" });
    const runId = await admin.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    expect(await finishRun(t, owner, workspaceId, runId)).toBe("completed");
  });

  it("records how long a model step took", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seedPeople(t);
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    await t.mutation(internal.runs.commitModel, {
      runId,
      idempotencyKey: `${runId}:1`,
      index: 1,
      text: "x",
      inputTokens: 1,
      outputTokens: 1,
      costCents: 1,
      provider: "fake",
      model: "fake-writer",
      workKind: "write",
      durationMs: 2750,
    });
    await t.mutation(internal.runs.fail, {
      runId,
      index: 2,
      idempotencyKey: `${runId}:2`,
      code: "refused",
      kind: "model",
      durationMs: 1200,
      costCents: 0.5,
    });
    const run = await owner.query(api.runs.get, { workspaceId, runId });
    expect(run.steps.map((step) => [step.index, step.durationMs])).toEqual([
      [1, 2750],
      [2, 1200],
    ]);
  });

  it("lists only open runs in this workspace for the live panel", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, viewer, workspaceId } = await seedPeople(t);
    await confirmProfile(owner, workspaceId);
    const done = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    expect(await finishRun(t, owner, workspaceId, done)).toBe("completed");
    const open = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    const live = await viewer.query(api.runs.open, { workspaceId });
    expect(live.map((row) => [row.id, row.status])).toEqual([[open, "queued"]]);
    const other = t.withIdentity(person("other", "other@example.com"));
    const otherId = await other.mutation(api.workspace.create, { name: "Beta" });
    expect(await other.query(api.runs.open, { workspaceId: otherId })).toEqual([]);
    await expect(other.query(api.runs.open, { workspaceId })).rejects.toThrow(NOT_FOUND);
  });

  it("schedules its own steps and its time-cap stop when it starts", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seedPeople(t);
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    const scheduled = await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").take(10));
    expect(scheduled.map((row) => row.name).sort()).toEqual(["runs:expire", "runs:step"]);
    // Fired early (time was spent waiting on a person), it only pushes the stop back.
    await t.mutation(internal.runs.expire, { runId: runId as never });
    expect((await owner.query(api.runs.get, { workspaceId, runId })).stopReason).toBeNull();
    vi.setSystemTime(Date.now() + 300_001);
    await t.mutation(internal.runs.expire, { runId: runId as never });
    expect((await owner.query(api.runs.get, { workspaceId, runId })).stopReason).toBe("cap");
  });
});
