/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_CAPS, PLATFORM_CEILING, SMALL_CEILING, capsForSkill, dayKey, overCap } from "./lib/caps";
import { loadSkillCaps, skillDaySpend } from "./lib/capStore";
import { NOT_ALLOWED, NOT_FOUND } from "./lib/errors";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

function person(subject: string) {
  return {
    subject,
    email: `${subject}@example.com`,
    name: subject,
    issuer: "https://clerk.vistrial.test",
    tokenIdentifier: `https://clerk.vistrial.test|${subject}`,
  };
}

async function seed() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity(person("owner"));
  const manager = t.withIdentity(person("manager"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Alpha" });
  const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: "manager@example.com", role: "manager" });
  await manager.mutation(api.workspace.acceptInvite, { token: invite.token });
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: "growth-architect", state: "on" });
  await owner.mutation(api.profile.saveDraft, {
    workspaceId,
    offer: "Deep cleaning",
    priceNotes: "$300",
    audience: "Homeowners",
    geography: "Austin",
    channels: "Meta",
    brandVoice: "Plain",
    competitors: [],
  });
  await owner.mutation(api.profile.confirm, { workspaceId });
  return { t, owner, manager, workspaceId };
}

function caps(skillSlug: string, run: number, day: number) {
  return { skillSlug, maxCostCentsPerRun: run, maxCostCentsPerDay: day, maxSteps: 40, maxDurationMs: 300_000 };
}

async function setSpend(t: ReturnType<typeof convexTest>, workspaceId: Id<"workspaces">, skillSlug: string, cents: number) {
  await t.run(async (ctx) => {
    await ctx.db.insert("skillSpend", { workspaceId, skillSlug, day: dayKey(), costCents: cents });
  });
}

describe("per-skill caps", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env.ALLOW_DEV_SKILLS = "true";
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.ALLOW_DEV_SKILLS;
  });

  it("gives Market Intelligence $3 a run and $25 a day, under a $10 and $100 ceiling, and keeps the test skills small", () => {
    const research = capsForSkill("market-intelligence");
    expect(research.defaults).toMatchObject({ maxCostCentsPerRun: 300, maxCostCentsPerDay: 2500 });
    expect(research.ceiling).toMatchObject({ maxCostCentsPerRun: 1000, maxCostCentsPerDay: 10_000 });
    expect(PLATFORM_CEILING).toMatchObject({ maxCostCentsPerRun: 1000, maxCostCentsPerDay: 10_000 });
    for (const slug of ["test-echo", "test-research"]) {
      expect(capsForSkill(slug)).toEqual({ defaults: DEFAULT_CAPS, ceiling: SMALL_CEILING });
    }
    expect(DEFAULT_CAPS).toMatchObject({ maxCostCentsPerRun: 25, maxCostCentsPerDay: 200 });
    expect(SMALL_CEILING).toMatchObject({ maxCostCentsPerRun: 100, maxCostCentsPerDay: 1000 });
  });

  it("lets an Owner raise Market Intelligence to its ceiling and no further, and the test skill only to its own", async () => {
    const { owner, manager, workspaceId } = await seed();
    await owner.mutation(api.controls.setCaps, { workspaceId, ...caps("market-intelligence", 1000, 10_000) });
    await expect(owner.mutation(api.controls.setCaps, { workspaceId, ...caps("market-intelligence", 1001, 10_000) })).rejects.toThrow(
      "platform ceiling",
    );
    await expect(owner.mutation(api.controls.setCaps, { workspaceId, ...caps("market-intelligence", 300, 10_001) })).rejects.toThrow(
      "platform ceiling",
    );
    await expect(owner.mutation(api.controls.setCaps, { workspaceId, ...caps("test-echo", 101, 200) })).rejects.toThrow(
      "platform ceiling",
    );
    await expect(owner.mutation(api.controls.setCaps, { workspaceId, ...caps("test-echo", 25, 1001) })).rejects.toThrow(
      "platform ceiling",
    );
    await expect(manager.mutation(api.controls.setCaps, { workspaceId, ...caps("test-echo", 10, 100) })).rejects.toThrow(NOT_ALLOWED);
    await expect(owner.mutation(api.controls.setCaps, { workspaceId, ...caps("no-such-skill", 10, 100) })).rejects.toThrow(NOT_FOUND);
    const controls = await owner.query(api.controls.get, { workspaceId });
    const research = controls.skills.find((skill) => skill.slug === "market-intelligence");
    expect(research).toMatchObject({ name: "Market Intelligence", caps: { maxCostCentsPerRun: 1000, maxCostCentsPerDay: 10_000 } });
    expect(controls.skills.find((skill) => skill.slug === "test-echo")?.caps).toEqual(DEFAULT_CAPS);
  });

  it("stops a Market Intelligence run at $3 and lets a $2.99 run go on", async () => {
    const { t, workspaceId } = await seed();
    const research = await t.run((ctx) => loadSkillCaps(ctx, workspaceId, "market-intelligence", "growth-architect"));
    const base = { caps: research, dayCost: 0, steps: 10, startedAt: 0, now: 1000 };
    expect(overCap({ ...base, runCost: 299 })).toBe(false);
    expect(overCap({ ...base, runCost: 300 })).toBe(true);
    expect(overCap({ ...base, runCost: 10, dayCost: 2499 })).toBe(false);
    expect(overCap({ ...base, runCost: 10, dayCost: 2500 })).toBe(true);
    // The same spend would already have stopped the test skill.
    const small = await t.run((ctx) => loadSkillCaps(ctx, workspaceId, "test-echo", "growth-architect"));
    expect(overCap({ ...base, caps: small, runCost: 25 })).toBe(true);
  });

  it("counts each skill's day spend on its own, so one skill's spend does not stop another", async () => {
    const { t, owner, workspaceId } = await seed();
    await setSpend(t, workspaceId, "test-echo", 200);
    const capped = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    expect((await owner.query(api.runs.get, { workspaceId, runId: capped })).stopReason).toBe("cap");
    // The other skill still starts: its day total is its own.
    const other = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-research" });
    const run = await owner.query(api.runs.get, { workspaceId, runId: other });
    expect(run.status).toBe("queued");
    expect(run.caps.maxCostCentsPerRun).toBe(25);
    expect(run.daySpentCents).toBe(0);
  });

  it("charges a run to its own skill's day total and to the agent's", async () => {
    const { t, owner, workspaceId } = await seed();
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "test-echo" });
    for (let i = 0; i < 10; i += 1) {
      vi.advanceTimersByTime(0);
      await t.finishInProgressScheduledFunctions();
    }
    const run = await owner.query(api.runs.get, { workspaceId, runId });
    expect(run.status).toBe("completed");
    expect(run.costCents).toBeGreaterThan(0);
    expect(run.daySpentCents).toBe(run.costCents);
    const totals = await t.run(async (ctx) => ({
      echo: await skillDaySpend(ctx, workspaceId, "test-echo", dayKey()),
      research: await skillDaySpend(ctx, workspaceId, "market-intelligence", dayKey()),
      agent: (await ctx.db.query("capCounters").collect()).reduce((sum, row) => sum + row.costCents, 0),
    }));
    expect(totals).toEqual({ echo: run.costCents, research: 0, agent: run.costCents });
  });

  it("applies caps an Owner set per agent to the test skills only, and keeps a saved row under the ceiling", async () => {
    const { t, workspaceId } = await seed();
    await t.run(async (ctx) => {
      await ctx.db.insert("agentCaps", { workspaceId, agentSlug: "growth-architect", maxCostCentsPerRun: 10, maxCostCentsPerDay: 50, maxSteps: 40, maxDurationMs: 300_000 });
    });
    const loaded = await t.run(async (ctx) => ({
      echo: await loadSkillCaps(ctx, workspaceId, "test-echo", "growth-architect"),
      research: await loadSkillCaps(ctx, workspaceId, "market-intelligence", "growth-architect"),
    }));
    expect(loaded.echo).toMatchObject({ maxCostCentsPerRun: 10, maxCostCentsPerDay: 50 });
    expect(loaded.research).toMatchObject({ maxCostCentsPerRun: 300, maxCostCentsPerDay: 2500 });
    // A row saved above today's ceiling is read at the ceiling.
    await t.run(async (ctx) => {
      await ctx.db.insert("skillCaps", {
        workspaceId,
        skillSlug: "test-echo",
        maxCostCentsPerRun: 5000,
        maxCostCentsPerDay: 50_000,
        maxSteps: 999,
        maxDurationMs: 9_999_999,
        updatedBy: "owner",
        updatedAt: 0,
      });
    });
    expect(await t.run((ctx) => loadSkillCaps(ctx, workspaceId, "test-echo", "growth-architect"))).toEqual(SMALL_CEILING);
  });

  it("keeps caps and spend inside the workspace", async () => {
    const { t, owner, workspaceId } = await seed();
    const other = t.withIdentity(person("other"));
    const otherId = await other.mutation(api.workspace.create, { name: "Beta" });
    await owner.mutation(api.controls.setCaps, { workspaceId, ...caps("market-intelligence", 500, 5000) });
    await setSpend(t, workspaceId, "market-intelligence", 1234);
    await expect(other.query(api.controls.get, { workspaceId })).rejects.toThrow(NOT_FOUND);
    await expect(other.mutation(api.controls.setCaps, { workspaceId, ...caps("market-intelligence", 1000, 10_000) })).rejects.toThrow(NOT_FOUND);
    const mine = await other.query(api.controls.get, { workspaceId: otherId });
    expect(mine.skills.find((skill) => skill.slug === "market-intelligence")).toMatchObject({
      caps: { maxCostCentsPerRun: 300, maxCostCentsPerDay: 2500 },
      daySpentCents: 0,
    });
    const theirs = await owner.query(api.controls.get, { workspaceId });
    expect(theirs.skills.find((skill) => skill.slug === "market-intelligence")).toMatchObject({
      caps: { maxCostCentsPerRun: 500, maxCostCentsPerDay: 5000 },
      daySpentCents: 1234,
    });
  });
});
