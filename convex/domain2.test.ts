/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const IMPORT_KEY = "import-secret";
const SYSTEM_KEY = "system-secret";

function workspace(id: string) {
  return {
    legacyId: id,
    name: id,
    slug: id,
    timezone: "America/New_York",
    status: "active",
    product: "core",
    isPlatformWorkspace: false,
    row: { id },
  };
}

async function harness() {
  process.env.DIRECTORY_IMPORT_KEY = IMPORT_KEY;
  process.env.CONVEX_SYSTEM_KEY = SYSTEM_KEY;
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("workspaces", workspace("ws-a"));
    await ctx.db.insert("workspaces", workspace("ws-b"));
    await ctx.db.insert("members", {
      legacyId: "m-op",
      workspaceId: "ws-a",
      userId: "user-op",
      role: "operator",
      seat: "customer",
      active: true,
      email: "op@example.com",
      displayName: "Op",
      canExport: false,
      canApprove: false,
      row: {},
    });
    await ctx.db.insert("members", {
      legacyId: "m-owner",
      workspaceId: "ws-a",
      userId: "user-owner",
      role: "owner",
      seat: "customer",
      active: true,
      email: "owner@example.com",
      displayName: "Owner",
      canExport: true,
      canApprove: true,
      row: {},
    });
    await ctx.db.insert("platformStaff", {
      userId: "user-service",
      role: "service_team",
      active: true,
      templateAccess: false,
      billingAccess: false,
      canCreateWorkspaces: false,
      displayName: "Service",
      email: "service@example.com",
      row: {},
    });
  });
  return t;
}

afterEach(() => {
  delete process.env.DIRECTORY_IMPORT_KEY;
  delete process.env.CONVEX_SYSTEM_KEY;
});

describe("domain 2", () => {
  it("refuses a live write that presents the import key", async () => {
    const t = await harness();
    await expect(
      t.mutation(api.record.commit, {
        key: IMPORT_KEY,
        job: "relay",
        workspaceId: "ws-a",
        ops: [],
      }),
    ).rejects.toThrow();
  });

  it("copies history in order, maps older logs, and redacts inbound replies", async () => {
    const t = await harness();
    const copied = await t.mutation(api.importLive.importHistory, {
      key: IMPORT_KEY,
      purpose: "history",
      runs: [
        {
          id: "run-1",
          org_id: "ws-a",
          agent_id: "scribe",
          lead_id: "lead-1",
          status: "completed",
          subject_label: "Call with June",
          verbatim: true,
        },
      ],
      steps: [],
      events: [
        { id: "ev-2", org_id: "ws-a", run_id: "run-1", agent_id: "scribe", kind: "run_finished", label: "Finished", occurred_at: "2026-01-01T00:00:02.000Z", seq: 2 },
        { id: "ev-1", org_id: "ws-a", run_id: "run-1", agent_id: "scribe", kind: "run_started", label: "Started", occurred_at: "2026-01-01T00:00:01.000Z", seq: 1 },
      ],
      outputs: [
        {
          id: "out-1",
          org_id: "ws-a",
          run_id: "run-1",
          agent_id: "scribe",
          kind: "summary",
          title: "Case file",
          body: 'Summary. The lead replied: "See you Tuesday." Next step is set.',
        },
      ],
      staff: [],
      agentRuns: [{ id: "old-run", org_id: "ws-a", agent_id: "operator", status: "completed" }],
      agentRunSteps: [{ id: "old-step", org_id: "ws-a", run_id: "old-run", seq: 1, label: "Looked up the account", state: "done" }],
      agentRunApprovals: [{ id: "old-approval", org_id: "ws-a", run_id: "old-run", created_at: "2026-01-01T00:00:00.000Z" }],
      agentEvents: [{ id: "old-event", org_id: "ws-a", action_taken: "slack_post", occurred_at: "2026-01-02T00:00:00.000Z" }],
      agentEscalations: [{ id: "old-esc", org_id: "ws-a", run_id: "old-run", created_at: "2026-01-01T00:00:00.000Z" }],
      agentAssets: [{ id: "old-asset", org_id: "ws-a", run_id: "old-run", title: "Notes", body: "A saved note." }],
      researchFacts: [{ id: "", org_id: "ws-a", fact: "dropped" }, { id: "fact-1", org_id: "ws-a", created_at: "2026-01-01T00:00:00.000Z" }],
    });
    expect(copied.runs).toBe(1);
    expect(copied.events).toBe(2);
    expect(copied.agentRuns).toBe(1);
    expect(copied.agentRunSteps).toBe(1);
    expect(copied.agentRunApprovals).toBe(1);
    expect(copied.agentEvents).toBe(1);
    expect(copied.agentEscalations).toBe(1);
    expect(copied.agentAssets).toBe(1);
    expect(copied.researchFacts).toBe(1);
    expect(copied.unmapped).toBe(1);
    expect(copied.redacted).toBe(1);
    const ordered = await t.run(async (ctx) => {
      const events = await ctx.db.query("activityEvents").take(20);
      return events
        .filter((event) => event.legacyId === "ev-1" || event.legacyId === "ev-2")
        .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
        .map((event) => event.legacyId);
    });
    expect(ordered).toEqual(["ev-1", "ev-2"]);
    const body = await t.run(async (ctx) => {
      const output = await ctx.db.query("activityOutputs").take(5);
      return output.map((row) => (row.row as { body?: string }).body);
    });
    expect(body.join(" ")).not.toContain("See you Tuesday");
    const uses = await t.run(async (ctx) => ctx.db.query("importUses").take(5));
    expect(uses.some((row) => row.purpose === "history")).toBe(true);
  });

  it("hides a reassigned lead from an operator, including the notice", async () => {
    const t = await harness();
    await t.mutation(api.leadAccess.sync, {
      key: SYSTEM_KEY,
      job: "assignment",
      workspaceId: "ws-a",
      leadId: "lead-1",
      setterMemberId: "m-op",
    });
    await t.mutation(api.record.commit, {
      key: SYSTEM_KEY,
      job: "scribe",
      workspaceId: "ws-a",
      ops: [
        {
          idempotencyKey: "run-1",
          seq: 1,
          occurredAt: "2026-02-01T00:00:00.000Z",
          kind: "run",
          action: "insert",
          row: {
            id: "run-1",
            org_id: "ws-a",
            agent_id: "scribe",
            lead_id: "lead-1",
            status: "working",
            subject_label: "Call with a lead",
          },
        },
      ],
    });
    const before = await t.withIdentity({ subject: "user-op" }).query(api.live.feed, { workspaceId: "ws-a" });
    expect(before.runs).toHaveLength(1);
    const created = await t.mutation(api.notify.enqueue, {
      key: SYSTEM_KEY,
      job: "notifications",
      workspaceId: "ws-a",
      legacyId: "note-1",
      eventType: "speed_to_lead",
      channel: "push",
      recipientUserId: "user-op",
      recipientMemberId: "m-op",
      leadId: "lead-1",
      title: "A lead is waiting",
      body: "A lead is waiting.",
      dedupeKey: "speed:1",
      sendAfter: "2026-02-01T00:00:00.000Z",
    });
    expect(created.created).toBe(true);
    await t.mutation(api.leadAccess.sync, {
      key: SYSTEM_KEY,
      job: "assignment",
      workspaceId: "ws-a",
      leadId: "lead-1",
      setterMemberId: "m-owner",
    });
    const after = await t.withIdentity({ subject: "user-op" }).query(api.live.feed, { workspaceId: "ws-a" });
    expect(after.runs).toHaveLength(0);
    const claim = await t.mutation(api.notify.claim, { key: SYSTEM_KEY, job: "notifications", legacyId: "note-1" });
    expect(claim.send).toBe(false);
    if ("reason" in claim) expect(claim.reason).toBe("not_visible");
  });

  it("denies a Service Team member who is not assigned to the workspace", async () => {
    const t = await harness();
    await expect(t.withIdentity({ subject: "user-service" }).query(api.live.feed, { workspaceId: "ws-a" })).rejects.toThrow();
    await t.run(async (ctx) => {
      await ctx.db.insert("assignments", {
        legacyId: "as-1",
        workspaceId: "ws-a",
        userId: "user-service",
        active: true,
        row: {},
      });
      await ctx.db.insert("members", {
        legacyId: "m-service",
        workspaceId: "ws-b",
        userId: "user-service",
        role: "admin",
        seat: "staff",
        active: true,
        email: "service@example.com",
        displayName: "Service",
        canExport: true,
        canApprove: false,
        row: {},
      });
    });
    const feed = await t.withIdentity({ subject: "user-service" }).query(api.live.feed, { workspaceId: "ws-a" });
    expect(feed.runs).toEqual([]);
    const notice = await t.mutation(api.notify.enqueue, {
      key: SYSTEM_KEY,
      job: "notifications",
      workspaceId: "ws-b",
      legacyId: "note-b",
      eventType: "adoption_warning",
      channel: "email",
      recipientUserId: "user-service",
      recipientMemberId: "m-service",
      title: "A workspace needs a look",
      body: "A workspace needs a look.",
      dedupeKey: "adopt:b",
      sendAfter: "2026-02-01T00:00:00.000Z",
    });
    expect(notice.created).toBe(false);
  });

  it("stops work when an agent is paused or halted", async () => {
    const t = await harness();
    const owner = t.withIdentity({ subject: "user-owner" });
    await owner.mutation(api.pause.setPaused, {
      workspaceId: "ws-a",
      agentId: "relay",
      paused: true,
      actorName: "Dana",
      reason: "Checking a draft",
    });
    const paused = await t.query(api.pause.mayRun, { key: SYSTEM_KEY, job: "relay", workspaceId: "ws-a", agentId: "relay" });
    expect(paused).toEqual({ ok: false, reason: "paused" });
    await owner.mutation(api.pause.setPaused, { workspaceId: "ws-a", agentId: "relay", paused: false, actorName: "Dana" });
    await t.mutation(api.pause.setHalt, {
      key: SYSTEM_KEY,
      job: "platform-halt",
      agentId: "relay",
      halted: true,
      actorId: "user-admin",
      actorName: "Ada",
      reason: "Emergency",
    });
    const halted = await t.query(api.pause.mayRun, { key: SYSTEM_KEY, job: "relay", workspaceId: "ws-a", agentId: "relay" });
    expect(halted).toEqual({ ok: false, reason: "paused" });
  });

  it("summarizes the notice that would pass the hourly cap", async () => {
    const t = await harness();
    const ninth = await t.mutation(api.notify.enqueue, {
      key: SYSTEM_KEY,
      job: "observe",
      workspaceId: "ws-a",
      legacyId: "note-cap",
      eventType: "speed_to_lead",
      channel: "push",
      recipientUserId: "user-owner",
      recipientMemberId: "m-owner",
      title: "A lead is waiting",
      body: "A lead is waiting.",
      dedupeKey: "cap:1",
      sendAfter: "2026-02-01T00:00:00.000Z",
      personCount: 8,
      workspaceCount: 1,
    });
    expect(ninth.eventType).toBe("hourly_summary");
  });

  it("sends the daily digest once, at 8:00 in each person's timezone", async () => {
    const t = await harness();
    const morning = "2026-10-20T12:05:00.000Z";
    const east = await t.query(api.notify.digestWindow, {
      key: SYSTEM_KEY,
      job: "notifications",
      at: morning,
      timeZone: "America/New_York",
      alreadySentOn: null,
    });
    const west = await t.query(api.notify.digestWindow, {
      key: SYSTEM_KEY,
      job: "notifications",
      at: morning,
      timeZone: "America/Los_Angeles",
      alreadySentOn: null,
    });
    expect(east.due).toBe(true);
    expect(west.due).toBe(false);
    const again = await t.query(api.notify.digestWindow, {
      key: SYSTEM_KEY,
      job: "notifications",
      at: morning,
      timeZone: "America/New_York",
      alreadySentOn: "2026-10-20",
    });
    expect(again.due).toBe(false);
    const laterWest = await t.query(api.notify.digestWindow, {
      key: SYSTEM_KEY,
      job: "notifications",
      at: "2026-10-20T15:05:00.000Z",
      timeZone: "America/Los_Angeles",
      alreadySentOn: null,
    });
    expect(laterWest.due).toBe(true);
  });

  it("does not deliver a notice twice after a forced retry", async () => {
    const t = await harness();
    await t.mutation(api.notify.enqueue, {
      key: SYSTEM_KEY,
      job: "observe",
      workspaceId: "ws-a",
      legacyId: "note-once",
      eventType: "task_due",
      channel: "email",
      recipientUserId: "user-owner",
      recipientMemberId: "m-owner",
      title: "A task is due",
      body: "A task is due.",
      dedupeKey: "task:1",
      sendAfter: "2026-02-01T00:00:00.000Z",
    });
    const first = await t.mutation(api.notify.claim, { key: SYSTEM_KEY, job: "notifications", legacyId: "note-once" });
    const second = await t.mutation(api.notify.claim, { key: SYSTEM_KEY, job: "notifications", legacyId: "note-once" });
    expect(first.send).toBe(true);
    expect(second.send).toBe(false);
  });

  it("creates no notification for a historic or imported event", async () => {
    const t = await harness();
    const historic = await t.mutation(api.notify.enqueue, {
      key: SYSTEM_KEY,
      job: "observe",
      workspaceId: "ws-a",
      legacyId: "note-old",
      eventType: "speed_to_lead",
      channel: "push",
      title: "A lead is waiting",
      body: "A lead is waiting.",
      dedupeKey: "old:1",
      sendAfter: "2026-02-01T00:00:00.000Z",
      historic: true,
    });
    const imported = await t.mutation(api.notify.enqueue, {
      key: SYSTEM_KEY,
      job: "observe",
      workspaceId: "ws-a",
      legacyId: "note-import",
      eventType: "speed_to_lead",
      channel: "push",
      title: "A lead is waiting",
      body: "A lead is waiting.",
      dedupeKey: "old:2",
      sendAfter: "2026-02-01T00:00:00.000Z",
      imported: true,
    });
    expect(historic.created).toBe(false);
    expect(imported.created).toBe(false);
  });

  it("matches the lead access index after a burst of reassignment", async () => {
    const t = await harness();
    const rows = Array.from({ length: 12 }, (_, index) => ({
      leadId: `lead-${index}`,
      workspaceId: "ws-a",
      setterMemberId: index % 2 === 0 ? "m-op" : "m-owner",
    }));
    await t.mutation(api.leadAccess.syncMany, { key: SYSTEM_KEY, job: "assignment", workspaceId: "ws-a", rows });
    const moved = rows.map((row, index) => ({ ...row, setterMemberId: index % 2 === 0 ? "m-owner" : "m-op" }));
    await t.mutation(api.leadAccess.syncMany, { key: SYSTEM_KEY, job: "assignment", workspaceId: "ws-a", rows: moved });
    const diff = await t.query(api.leadAccess.compare, {
      key: SYSTEM_KEY,
      job: "assignment",
      workspaceId: "ws-a",
      postgres: moved,
    });
    expect(diff.differences).toBe(0);
  });

  it("removes a deleted lead's name from moved words", async () => {
    const t = await harness();
    await t.mutation(api.importLive.importHistory, {
      key: IMPORT_KEY,
      purpose: "history",
      runs: [
        {
          id: "run-name",
          org_id: "ws-a",
          agent_id: "scribe",
          lead_id: "lead-9",
          status: "completed",
          subject_label: "Call with June Hart",
          verbatim: true,
        },
      ],
      steps: [],
      events: [
        {
          id: "ev-name",
          org_id: "ws-a",
          run_id: "run-name",
          agent_id: "scribe",
          lead_id: "lead-9",
          kind: "run_finished",
          label: "Finished June Hart",
          occurred_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      outputs: [
        {
          id: "out-name",
          org_id: "ws-a",
          run_id: "run-name",
          agent_id: "scribe",
          lead_id: "lead-9",
          kind: "summary",
          title: "Case file",
          body: "June Hart asked for a Tuesday call.",
        },
      ],
      staff: [],
      agentRuns: [],
      agentRunSteps: [],
      agentRunApprovals: [],
      agentEvents: [],
      agentEscalations: [],
      agentAssets: [],
      researchFacts: [],
    });
    const result = await t.mutation(api.privacy.redactLead, {
      key: SYSTEM_KEY,
      job: "deletion",
      workspaceId: "ws-a",
      leadId: "lead-9",
      names: ["June Hart"],
    });
    expect(result.changed).toBeGreaterThan(0);
    const text = await t.run(async (ctx) => {
      const runs = await ctx.db.query("activityRuns").take(10);
      const outputs = await ctx.db.query("activityOutputs").take(10);
      return JSON.stringify({ runs, outputs });
    });
    expect(text).not.toContain("June Hart");
    expect(text).toContain("a lead");
  });
});
