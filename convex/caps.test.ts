/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_CAPS, PLATFORM_CEILING, SKILL_CAPS, assertWithinCeiling, capScope, dayKey } from "./lib/caps";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const MI = "market-intelligence";

const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;
const AGENT = "growth-architect";

function person(subject: string) {
  return {
    subject,
    email: `${subject}@example.com`,
    name: subject,
    issuer: "https://clerk.vistrial.test",
    tokenIdentifier: `https://clerk.vistrial.test|${subject}`,
  };
}

async function seed(t: Tester) {
  const owner = t.withIdentity(person("owner"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Alpha" });
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: AGENT, state: "on" });
  return { owner, workspaceId };
}

/** A Market Intelligence run as the runtime holds it. The skill is not built yet (2.11), so the row is written directly. */
async function miRun(t: Tester, workspaceId: Id<"workspaces">, costCents: number) {
  return t.run(async (ctx) =>
    ctx.db.insert("agentRuns", {
      workspaceId,
      agentSlug: AGENT,
      skillSlug: MI,
      status: "running",
      startedBy: "owner",
      inputRef: MI,
      startedAt: Date.now(),
      costCents,
      inputTokens: 0,
      outputTokens: 0,
    }),
  );
}

async function counters(t: Tester, workspaceId: Id<"workspaces">) {
  const rows = await t.run(async (ctx) =>
    ctx.db.query("capCounters").withIndex("by_workspace_agent_day", (q) => q.eq("workspaceId", workspaceId)).take(10),
  );
  return Object.fromEntries(rows.map((row) => [row.skillSlug ?? "agent", row.costCents]));
}

function model(runId: Id<"agentRuns">, index: number, costCents: number) {
  return {
    runId,
    idempotencyKey: `${runId}:${index}`,
    index,
    text: "x",
    inputTokens: 1,
    outputTokens: 1,
    costCents,
    provider: "fake",
    model: "fake-writer",
  };
}

describe("per-skill caps", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.ALLOW_DEV_SKILLS;
  });

  it("gives Market Intelligence $3 a run and $25 a day, inside a $10 / $100 ceiling; the test skill keeps its small caps", async () => {
    expect(SKILL_CAPS[MI]).toMatchObject({ maxCostCentsPerRun: 300, maxCostCentsPerDay: 2500 });
    expect(PLATFORM_CEILING).toMatchObject({ maxCostCentsPerRun: 1000, maxCostCentsPerDay: 10_000 });
    for (const caps of Object.values(SKILL_CAPS)) expect(() => assertWithinCeiling(caps)).not.toThrow();
    expect(capScope(MI)).toBe(MI);
    expect(capScope("test-echo")).toBeUndefined();
    expect(capScope("constructor")).toBeUndefined();

    const t = makeTester();
    const { owner, workspaceId } = await seed(t);
    const mi = await owner.query(api.controls.get, { workspaceId, agentSlug: AGENT, skillSlug: MI });
    expect(mi).toMatchObject({ caps: SKILL_CAPS[MI], scope: "skill", daySpentCents: 0 });
    const echo = await owner.query(api.controls.get, { workspaceId, agentSlug: AGENT, skillSlug: "test-echo" });
    expect(echo).toMatchObject({ caps: DEFAULT_CAPS, scope: "agent" });
    const agent = await owner.query(api.controls.get, { workspaceId, agentSlug: AGENT });
    expect(agent.caps).toEqual(DEFAULT_CAPS);
  });

  it("keeps the skill's caps and the agent's caps apart when an Owner sets either", async () => {
    const t = makeTester();
    const { owner, workspaceId } = await seed(t);
    const base = { workspaceId, agentSlug: AGENT, maxSteps: 40, maxDurationMs: 300_000 };
    await owner.mutation(api.controls.setCaps, { ...base, maxCostCentsPerRun: 10, maxCostCentsPerDay: 50 });
    expect((await owner.query(api.controls.get, { workspaceId, agentSlug: AGENT, skillSlug: MI })).caps).toEqual(SKILL_CAPS[MI]);
    await owner.mutation(api.controls.setCaps, { ...base, skillSlug: MI, maxCostCentsPerRun: 1000, maxCostCentsPerDay: 10_000 });
    expect((await owner.query(api.controls.get, { workspaceId, agentSlug: AGENT, skillSlug: MI })).caps).toMatchObject({
      maxCostCentsPerRun: 1000,
      maxCostCentsPerDay: 10_000,
    });
    expect((await owner.query(api.controls.get, { workspaceId, agentSlug: AGENT })).caps).toMatchObject({ maxCostCentsPerRun: 10 });
    await expect(
      owner.mutation(api.controls.setCaps, { ...base, skillSlug: MI, maxCostCentsPerRun: 1001, maxCostCentsPerDay: 2500 }),
    ).rejects.toThrow("platform ceiling");
    await expect(
      owner.mutation(api.controls.setCaps, { ...base, skillSlug: MI, maxCostCentsPerRun: 300, maxCostCentsPerDay: 10_001 }),
    ).rejects.toThrow("platform ceiling");
    // A skill without its own caps cannot get a row of its own.
    await expect(
      owner.mutation(api.controls.setCaps, { ...base, skillSlug: "test-echo", maxCostCentsPerRun: 10, maxCostCentsPerDay: 50 }),
    ).rejects.toThrow("uses the agent's caps");
  });

  it("stops a Market Intelligence run at $3, not at the test skill's 25 cents, and counts it on its own day budget", async () => {
    const t = makeTester();
    const { owner, workspaceId } = await seed(t);
    const runId = await miRun(t, workspaceId, 200);
    // 250 cents is far over the test skill's 25-cent cap, but under $3: the run carries on.
    expect((await t.mutation(internal.runs.commitModel, model(runId, 0, 50))).status).toBe("running");
    expect((await t.mutation(internal.runs.commitModel, model(runId, 1, 60))).status).toBe("stopped");
    const run = await owner.query(api.runs.get, { workspaceId, runId });
    expect(run).toMatchObject({ costCents: 310, stopReason: "cap", daySpentCents: 110 });
    expect(run.caps).toMatchObject({ maxCostCentsPerRun: 300, maxCostCentsPerDay: 2500, scope: "skill" });
    expect(await counters(t, workspaceId)).toEqual({ [MI]: 110 });
  });

  it("checks Market Intelligence's day cap before each step, separately from the agent's", async () => {
    const t = makeTester();
    const { owner, workspaceId } = await seed(t);
    const day = dayKey();
    await t.run(async (ctx) => {
      // The agent's day budget is spent. That must not stop research.
      await ctx.db.insert("capCounters", { workspaceId, agentSlug: AGENT, day, costCents: 200 });
      await ctx.db.insert("capCounters", { workspaceId, agentSlug: AGENT, skillSlug: MI, day, costCents: 2499 });
    });
    const under = await miRun(t, workspaceId, 299);
    await t.mutation(internal.runs.prepare, { runId: under });
    // Not capped: the run reached the skill lookup, which fails only because 2.11 has not built the skill yet.
    const passed = await owner.query(api.runs.get, { workspaceId, runId: under });
    expect(passed.steps.map((step) => step.resultCode)).toEqual(["skill_unavailable"]);
    expect(passed.stopReason).toBe("error");

    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("capCounters")
        .withIndex("by_workspace_agent_skill_day", (q) => q.eq("workspaceId", workspaceId).eq("agentSlug", AGENT).eq("skillSlug", MI).eq("day", day))
        .unique();
      await ctx.db.patch(row!._id, { costCents: 2500 });
    });
    const over = await miRun(t, workspaceId, 0);
    await t.mutation(internal.runs.prepare, { runId: over });
    const capped = await owner.query(api.runs.get, { workspaceId, runId: over });
    expect(capped).toMatchObject({ stopReason: "cap", steps: [] });
  });

  it("lets the test skill run when research has used its day, and still stops it at 25 cents", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = makeTester();
    const { owner, workspaceId } = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("capCounters", { workspaceId, agentSlug: AGENT, skillSlug: MI, day: dayKey(), costCents: 2500 });
    });
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: AGENT, skillSlug: "test-echo" });
    const started = await owner.query(api.runs.get, { workspaceId, runId });
    expect(started).toMatchObject({ status: "queued", daySpentCents: 0 });
    expect(started.caps).toMatchObject({ maxCostCentsPerRun: 25, maxCostCentsPerDay: 200, scope: "agent" });
    await t.run(async (ctx) => ctx.db.patch(runId, { costCents: 20 }));
    await t.mutation(internal.runs.commitModel, model(runId, 1, 6));
    expect((await owner.query(api.runs.get, { workspaceId, runId })).stopReason).toBe("cap");
    expect(await counters(t, workspaceId)).toEqual({ [MI]: 2500, agent: 6 });
  });
});
