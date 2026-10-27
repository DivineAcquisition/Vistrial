/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import { NOT_FOUND } from "./lib/errors";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

function person(subject: string, email: string) {
  return {
    subject,
    email,
    name: email,
    issuer: "https://clerk.vistrial.test",
    tokenIdentifier: `https://clerk.vistrial.test|${subject}`,
  };
}

type Tester = ReturnType<typeof convexTest>;

async function seed(t: Tester) {
  const owner = t.withIdentity(person("owner", "owner@example.com"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Alpha" });
  const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: "manager@example.com", role: "manager" });
  const manager = t.withIdentity(person("manager", "manager@example.com"));
  await manager.mutation(api.workspace.acceptInvite, { token: invite.token });
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
  return { owner, manager, workspaceId };
}

async function drain(t: Tester, caller: ReturnType<Tester["withIdentity"]>, workspaceId: string, runId: string) {
  let status = "queued";
  for (let i = 0; i < 20 && (status === "queued" || status === "running"); i += 1) {
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();
    status = (await caller.query(api.runs.get, { workspaceId, runId })).status as string;
  }
  return status;
}

describe("run and asset screens", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env.ALLOW_DEV_SKILLS = "true";
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.ALLOW_DEV_SKILLS;
  });

  it("pages runs newest first and applies the filters", async () => {
    const t = convexTest(schema, modules);
    const { owner, manager, workspaceId } = await seed(t);
    const first = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "sales", skillSlug: "test-echo" });
    await drain(t, owner, workspaceId, first);
    const second = await manager.mutation(api.runs.start, { workspaceId, agentSlug: "sales", skillSlug: "test-echo" });

    const all = await owner.query(api.runs.page, { workspaceId, paginationOpts: { numItems: 10, cursor: null } });
    expect(all.page.map((row: { id: string }) => row.id)).toEqual([second, first]);
    const mine = await owner.query(api.runs.page, { workspaceId, startedByMe: true, paginationOpts: { numItems: 10, cursor: null } });
    expect(mine.page.map((row: { id: string }) => row.id)).toEqual([first]);
    const done = await owner.query(api.runs.page, { workspaceId, status: "completed", paginationOpts: { numItems: 10, cursor: null } });
    expect(done.page.map((row: { id: string }) => row.id)).toEqual([first]);
    const other = await owner.query(api.runs.page, { workspaceId, agentSlug: "retention", paginationOpts: { numItems: 10, cursor: null } });
    expect(other.page).toHaveLength(0);

    const stranger = t.withIdentity(person("stranger", "stranger@example.com"));
    await stranger.mutation(api.workspace.create, { name: "Beta" });
    await expect(
      stranger.query(api.runs.page, { workspaceId, paginationOpts: { numItems: 10, cursor: null } }),
    ).rejects.toThrow(NOT_FOUND);
  });

  it("returns caps, spend, the starter and what the run made, with no model names", async () => {
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seed(t);
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "sales", skillSlug: "test-echo" });
    expect(await drain(t, owner, workspaceId, runId)).toBe("completed");
    const run = await owner.query(api.runs.get, { workspaceId, runId });
    expect(run.caps.maxCostCentsPerRun).toBe(25);
    expect(run.caps.softWarningCents).toBe(20);
    expect(run.daySpentCents).toBe(run.costCents);
    expect(run.startedByName).toBe("owner@example.com");
    expect(run.assets).toHaveLength(1);
    expect(run.assets[0].status).toBe("draft");
    expect(JSON.stringify(run)).not.toContain("fake-writer");
  });

  it("says when a stop came too late", async () => {
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seed(t);
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "sales", skillSlug: "test-echo" });
    expect(await owner.mutation(api.runs.stop, { workspaceId, runId })).toEqual({ stopped: true });
    expect(await owner.mutation(api.runs.stop, { workspaceId, runId })).toEqual({ stopped: false });
  });

  it("reads each version with its claims and names their sources", async () => {
    const t = convexTest(schema, modules);
    const { owner, manager, workspaceId } = await seed(t);
    const runId = await owner.mutation(api.runs.start, { workspaceId, agentSlug: "sales", skillSlug: "test-echo" });
    await drain(t, owner, workspaceId, runId);
    const [asset] = (await owner.query(api.runs.get, { workspaceId, runId })).assets;
    await manager.mutation(api.assets.addVersion, {
      workspaceId,
      assetId: asset.id,
      body: "ok\nmore",
      claims: [{ claimKey: "count", statement: "Twelve ads ran over 30 days.", computed: true }],
    });
    const current = await owner.query(api.assets.get, { workspaceId, assetId: asset.id });
    expect(current.currentVersion).toBe(2);
    expect(current.evidence).toEqual([
      { claimKey: "count", statement: "Twelve ads ran over 30 days.", computed: true, fetchedAt: null, sourceLabel: null },
    ]);
    const first = await owner.query(api.assets.version, { workspaceId, assetId: asset.id, version: 1 });
    expect(first.body).toBe("ok");
    expect(first.evidence[0].statement).toBe("The confirmed profile was read.");
    expect(first.evidence[0].sourceLabel).toBe("Business profile, version 1");

    const stranger = t.withIdentity(person("stranger", "stranger@example.com"));
    const otherId = await stranger.mutation(api.workspace.create, { name: "Beta" });
    await expect(
      stranger.query(api.assets.version, { workspaceId: otherId, assetId: asset.id, version: 1 }),
    ).rejects.toThrow(NOT_FOUND);
    await expect(owner.query(api.assets.version, { workspaceId, assetId: asset.id, version: 9 })).rejects.toThrow(NOT_FOUND);
  });
});
