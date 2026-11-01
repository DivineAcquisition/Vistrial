/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { CATALOG, GROWTH_ARCHITECT } from "./catalog";
import { NOT_FOUND } from "./lib/errors";
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

async function drainScheduler(t: ReturnType<typeof convexTest>) {
  for (let i = 0; i < 10; i += 1) {
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();
  }
}

describe("the seven-agent workforce", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.ALLOW_DEV_SKILLS;
  });

  it("seeds four departments and seven agents, with only Growth Architect live", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(person("owner"));
    const workspaceId = await owner.mutation(api.workspace.create, { name: "Alpha" });
    const shell = await owner.query(api.workspace.shell, { workspaceId });
    expect(shell.departments.map((row) => row.name)).toEqual([
      "Growth and Marketing",
      "Sales",
      "Customer Success",
      "Operations",
    ]);
    expect(shell.agents.map((agent) => [agent.number, agent.slug, agent.status])).toEqual(
      CATALOG.map((agent) => [agent.number, agent.slug, agent.status]),
    );
    expect(shell.agents.filter((agent) => agent.status === "live").map((agent) => agent.slug)).toEqual([GROWTH_ARCHITECT]);
    expect(shell.agents.find((agent) => agent.slug === GROWTH_ARCHITECT)?.skills).toHaveLength(6);
  });

  it("does not let a planned agent be turned on or start a run", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(person("owner"));
    const workspaceId = await owner.mutation(api.workspace.create, { name: "Alpha" });
    await expect(
      owner.mutation(api.workspace.setAgentState, { workspaceId, slug: "retention", state: "on" }),
    ).rejects.toThrow("Retention is not available yet.");
    await expect(
      owner.mutation(api.workspace.setAgentState, { workspaceId, slug: "retention", state: "suggesting" }),
    ).rejects.toThrow("not available yet");
    // Turning a planned agent off is harmless and allowed.
    await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: "retention", state: "off" });
    // Even with a stored "on" link, a planned agent cannot start a run.
    await t.run(async (ctx) => {
      const agent = await ctx.db.query("agents").withIndex("by_slug", (q) => q.eq("slug", "retention")).unique();
      const link = await ctx.db
        .query("workspaceAgents")
        .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", workspaceId).eq("agentId", agent!._id))
        .unique();
      await ctx.db.patch(link!._id, { state: "on" });
    });
    await expect(
      owner.mutation(api.runs.start, { workspaceId, agentSlug: "retention", skillSlug: "test-echo" }),
    ).rejects.toThrow("Retention is not available yet.");
    await expect(
      owner.mutation(api.runs.start, { workspaceId, agentSlug: "operations", skillSlug: "test-echo" }),
    ).rejects.toThrow(NOT_FOUND);
  });

  it("accepts the old slug from an older client and stores the new one", async () => {
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(person("owner"));
    const workspaceId = await owner.mutation(api.workspace.create, { name: "Alpha" });
    await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: "sales", state: "on" });
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "sales", skillSlug: "test-echo" });
    expect((await owner.query(api.runs.get, { workspaceId, runId })).agentSlug).toBe(GROWTH_ARCHITECT);
    expect(await owner.query(api.runs.list, { workspaceId, agentSlug: "sales" })).toHaveLength(1);
  });

  it("finishes the migration by itself when old rows are left, and does nothing after", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const workspaceId = await t.run(async (ctx) => {
      await ctx.db.insert("agents", { slug: "sales", name: "Sales Agent", stage: "execution", area: "sales", job: "j", promise: "p", sort: 0 });
      const id = await ctx.db.insert("workspaces", { name: "Old", slug: "old", timezone: "UTC", status: "active", createdAt: 0 });
      await ctx.db.insert("agentRuns", {
        workspaceId: id,
        agentSlug: "sales",
        skillSlug: "test-echo",
        status: "completed",
        startedBy: "owner",
        inputRef: "test-echo",
        startedAt: 0,
        costCents: 0,
        inputTokens: 0,
        outputTokens: 0,
      });
      return id;
    });
    expect(await t.mutation(internal.agentsMigration.backfillIfNeeded, {})).toBe(true);
    await drainScheduler(t);
    expect(await t.query(internal.agentsMigration.remaining, {})).toEqual({ agents: 0, runs: 0, caps: 0, counters: 0, oldShapeAgents: 0 });
    const runs = await t.run(async (ctx) =>
      ctx.db
        .query("agentRuns")
        .withIndex("by_workspace_agent", (q) => q.eq("workspaceId", workspaceId).eq("agentSlug", GROWTH_ARCHITECT))
        .collect(),
    );
    expect(runs).toHaveLength(1);
    // Nothing left: no work scheduled, nothing written.
    const scheduledBefore = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).length);
    expect(await t.mutation(internal.agentsMigration.backfillIfNeeded, {})).toBe(false);
    const scheduledAfter = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).length);
    expect(scheduledAfter).toBe(scheduledBefore);
  });

  it("migrates a deployment seeded with the old Sales Agent, keeping links, caps and spend", async () => {
    vi.useFakeTimers();
    process.env.ALLOW_DEV_SKILLS = "true";
    const t = convexTest(schema, modules);
    const day = new Date().toISOString().slice(0, 10);

    // The data as an older deployment holds it: the area catalog and runs under "sales".
    const seeded = await t.run(async (ctx) => {
      await ctx.db.insert("areas", { slug: "sales", name: "Sales", job: "j", promise: "p", sort: 0 });
      const sales = await ctx.db.insert("agents", {
        slug: "sales",
        name: "Sales Agent",
        stage: "execution",
        area: "sales",
        job: "j",
        promise: "p",
        sort: 0,
        skills: [{ slug: "ad-research", name: "Ad research", handsBack: "A report.", sort: 0 }],
      });
      const operations = await ctx.db.insert("agents", {
        slug: "operations",
        name: "Operations Agent",
        stage: "foundation",
        area: "operations",
        job: "j",
        promise: "p",
        sort: 2,
      });
      await ctx.db.insert("skills", {
        slug: "ad-research",
        agentSlug: "sales",
        name: "Ad research",
        job: "j",
        promise: "p",
        status: "comingSoon",
        sort: 0,
      });
      const workspaceId = await ctx.db.insert("workspaces", {
        name: "Old",
        slug: "old",
        timezone: "America/New_York",
        status: "active",
        createdAt: Date.now(),
      });
      await ctx.db.insert("members", { workspaceId, userId: "owner", role: "owner", displayName: "Owner", active: true });
      await ctx.db.insert("workspaceSettings", { workspaceId, setupDone: true, themeDefault: "light" });
      await ctx.db.insert("workspaceAgents", { workspaceId, agentId: sales, state: "on", updatedAt: 0, updatedBy: "owner" });
      await ctx.db.insert("workspaceAgents", { workspaceId, agentId: operations, state: "off", updatedAt: 0, updatedBy: "owner" });
      await ctx.db.insert("profileVersions", {
        workspaceId,
        version: 1,
        offer: "o",
        priceNotes: "",
        audience: "a",
        geography: "",
        channels: "",
        brandVoice: "",
        competitors: [],
        status: "confirmed",
      });
      const runs: Id<"agentRuns">[] = [];
      for (let i = 0; i < 3; i += 1) {
        runs.push(
          await ctx.db.insert("agentRuns", {
            workspaceId,
            agentSlug: "sales",
            skillSlug: "test-echo",
            status: "completed",
            startedBy: "owner",
            inputRef: "test-echo",
            startedAt: Date.now() - 1000 * (i + 1),
            costCents: 1,
            inputTokens: 1,
            outputTokens: 1,
          }),
        );
      }
      await ctx.db.insert("agentCaps", {
        workspaceId,
        agentSlug: "sales",
        maxCostCentsPerRun: 50,
        maxCostCentsPerDay: 400,
        maxSteps: 40,
        maxDurationMs: 300_000,
      });
      // Spend today under both slugs, as happens if a new run lands before the backfill.
      await ctx.db.insert("capCounters", { workspaceId, agentSlug: "sales", day, costCents: 7 });
      await ctx.db.insert("capCounters", { workspaceId, agentSlug: GROWTH_ARCHITECT, day, costCents: 5 });
      await ctx.db.insert("capCounters", { workspaceId, agentSlug: "sales", day: "2026-01-01", costCents: 3 });
      return { workspaceId, sales, runs };
    });

    expect((await t.query(internal.agentsMigration.remaining, {})).runs).toBe(3);
    await t.mutation(internal.agentsMigration.backfill, {});
    await drainScheduler(t);
    expect(await t.query(internal.agentsMigration.remaining, {})).toEqual({
      agents: 0,
      runs: 0,
      caps: 0,
      counters: 0,
      oldShapeAgents: 0,
    });

    const owner = t.withIdentity(person("owner"));
    const { workspaceId } = seeded;
    const shell = await owner.query(api.workspace.shell, { workspaceId });
    const architect = shell.agents.find((agent) => agent.slug === GROWTH_ARCHITECT);
    // Renamed in place: same row, so the workspace's "on" link still applies.
    expect(architect?.state).toBe("on");
    expect(await t.run(async (ctx) => (await ctx.db.get(seeded.sales))?.slug)).toBe(GROWTH_ARCHITECT);
    expect(shell.agents.some((agent) => agent.slug === "operations" || agent.slug === "sales")).toBe(false);
    expect(architect?.skills?.map((skill) => skill.slug)).not.toContain("ad-research");

    const runs = await owner.query(api.runs.list, { workspaceId, agentSlug: GROWTH_ARCHITECT });
    expect(runs.map((run) => run.id).sort()).toEqual([...seeded.runs].sort());
    // Caps set per agent before caps were per skill still apply to the test skill.
    const controls = await owner.query(api.controls.get, { workspaceId });
    expect(controls.skills.find((skill) => skill.slug === "test-echo")?.caps.maxCostCentsPerRun).toBe(50);
    const counters = await t.run(async (ctx) =>
      ctx.db
        .query("capCounters")
        .withIndex("by_workspace_agent_day", (q) => q.eq("workspaceId", workspaceId))
        .collect(),
    );
    expect(counters.map((row) => [row.agentSlug, row.day, row.costCents]).sort()).toEqual(
      [
        [GROWTH_ARCHITECT, "2026-01-01", 3],
        [GROWTH_ARCHITECT, day, 12],
      ].sort(),
    );

    // The migrated workspace runs again without anyone turning the agent back on.
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: GROWTH_ARCHITECT, skillSlug: "test-echo" });
    await drainScheduler(t);
    expect((await owner.query(api.runs.get, { workspaceId, runId })).status).toBe("completed");

    // Running it again changes nothing.
    await t.mutation(internal.agentsMigration.backfill, {});
    await drainScheduler(t);
    expect((await t.query(internal.agentsMigration.remaining, {})).runs).toBe(0);
  });
});
