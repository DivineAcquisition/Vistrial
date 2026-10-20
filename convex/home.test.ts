/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import { resolveVisit } from "./homeRules";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const DAY = 86_400_000;

async function seed() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const workspace = { timezone: "America/New_York", status: "active", product: "core", isPlatformWorkspace: false, row: {} };
    await ctx.db.insert("workspaces", { ...workspace, legacyId: "ws-a", name: "North", slug: "north" });
    await ctx.db.insert("workspaces", { ...workspace, legacyId: "ws-b", name: "South", slug: "south" });
    const member = { seat: "customer", active: true, email: "x@example.com", canExport: false, canApprove: false, row: {} };
    await ctx.db.insert("members", { ...member, legacyId: "m-owner", workspaceId: "ws-a", userId: "owner", role: "owner", displayName: "Owner" });
    await ctx.db.insert("members", { ...member, legacyId: "m-op", workspaceId: "ws-a", userId: "op", role: "setter", displayName: "Op" });
    await ctx.db.insert("members", { ...member, legacyId: "m-b", workspaceId: "ws-b", userId: "other", role: "owner", displayName: "Other" });
    await ctx.db.insert("platformStaff", {
      userId: "staff",
      role: "service_team",
      active: true,
      templateAccess: false,
      billingAccess: false,
      canCreateWorkspaces: false,
      displayName: "Staff",
      email: "s@example.com",
      row: {},
    });
    await ctx.db.insert("assignments", { legacyId: "as-1", workspaceId: "ws-a", userId: "staff", active: true, row: {} });
  });
  return t;
}

describe("resolveVisit", () => {
  const now = Date.parse("2026-10-20T15:00:00Z");

  it("starts the window at the last visit before today's first one", () => {
    const first = resolveVisit(null, now - DAY, "2026-10-19");
    expect(first.firstVisit).toBe(true);
    expect(first.sinceAt).toBeNull();
    const today = resolveVisit(first.next, now, "2026-10-20");
    expect(today.sinceAt).toBe(now - DAY);
    expect(today.firstViewToday).toBe(true);
    const later = resolveVisit({ ...today.next, briefingSeenDay: "2026-10-20" }, now + 3_600_000, "2026-10-20");
    expect(later.sinceAt).toBe(now - DAY);
    expect(later.firstViewToday).toBe(false);
  });

  it("never reaches further back than seven days", () => {
    const result = resolveVisit({ lastVisitAt: now - 30 * DAY, visitDay: "2026-09-20", sinceAt: null, briefingSeenDay: null }, now, "2026-10-20");
    expect(result.capped).toBe(true);
    expect(result.sinceAt).toBe(now - 7 * DAY);
  });
});

describe("home state access", () => {
  it("refuses strangers, other workspaces, and anonymous callers", async () => {
    const t = await seed();
    const args = { workspaceId: "ws-a", day: "2026-10-20", now: Date.now() };
    await expect(t.query(api.home.state, args)).rejects.toThrow();
    await expect(t.withIdentity({ subject: "other" }).query(api.home.state, args)).rejects.toThrow();
    const owner = await t.withIdentity({ subject: "owner" }).query(api.home.state, args);
    expect(owner.enabled).toBe(false);
    expect(owner.outcomeMetrics).toHaveLength(4);
  });

  it("keeps each person's view to themselves", async () => {
    const t = await seed();
    const owner = t.withIdentity({ subject: "owner" });
    const op = t.withIdentity({ subject: "op" });
    await owner.mutation(api.home.setCollapsed, { workspaceId: "ws-a", section: "stream", collapsed: true });
    await owner.mutation(api.home.snoozeLead, { workspaceId: "ws-a", leadId: "lead-1", until: Date.now() + DAY });
    const args = { workspaceId: "ws-a", day: "2026-10-20", now: Date.now() };
    const mine = await owner.query(api.home.state, args);
    const theirs = await op.query(api.home.state, args);
    expect(mine.prefs.collapsed).toEqual(["stream"]);
    expect(mine.snoozedLeadIds).toEqual(["lead-1"]);
    expect(theirs.prefs.collapsed).toEqual([]);
    expect(theirs.snoozedLeadIds).toEqual([]);
  });

  it("lets only staff switch the workspace on, and only owners pick numbers", async () => {
    const t = await seed();
    await expect(t.withIdentity({ subject: "owner" }).mutation(api.home.setEnabled, { workspaceId: "ws-a", enabled: true })).rejects.toThrow();
    await t.withIdentity({ subject: "staff" }).mutation(api.home.setEnabled, { workspaceId: "ws-a", enabled: true });
    const args = { workspaceId: "ws-a", day: "2026-10-20", now: Date.now() };
    expect((await t.withIdentity({ subject: "op" }).query(api.home.state, args)).enabled).toBe(true);
    expect((await t.withIdentity({ subject: "other" }).query(api.home.state, { ...args, workspaceId: "ws-b" })).enabled).toBe(false);

    await expect(t.withIdentity({ subject: "op" }).mutation(api.home.setOutcomeMetrics, { workspaceId: "ws-a", metrics: ["bookings"] })).rejects.toThrow();
    await expect(t.withIdentity({ subject: "owner" }).mutation(api.home.setOutcomeMetrics, { workspaceId: "ws-a", metrics: ["made_up"] })).rejects.toThrow();
    await t.withIdentity({ subject: "owner" }).mutation(api.home.setOutcomeMetrics, { workspaceId: "ws-a", metrics: ["bookings", "new_leads"] });
    expect((await t.withIdentity({ subject: "op" }).query(api.home.state, args)).outcomeMetrics).toEqual(["bookings", "new_leads"]);
  });

  it("does not let an Operator switch Work next to everyone", async () => {
    const t = await seed();
    await expect(t.withIdentity({ subject: "op" }).mutation(api.home.setWorkView, { workspaceId: "ws-a", scope: "everyone" })).rejects.toThrow();
    await t.withIdentity({ subject: "op" }).mutation(api.home.setWorkView, { workspaceId: "ws-a", order: "oldest" });
    const state = await t.withIdentity({ subject: "op" }).query(api.home.state, { workspaceId: "ws-a", day: "2026-10-20", now: Date.now() });
    expect(state.prefs.workOrder).toBe("oldest");
  });

  it("records visits and keeps three days of briefings", async () => {
    const t = await seed();
    const owner = t.withIdentity({ subject: "owner" });
    const start = Date.parse("2026-10-15T14:00:00Z");
    const first = await owner.mutation(api.home.recordVisit, { workspaceId: "ws-a", day: "2026-10-15", now: start });
    expect(first.firstVisit).toBe(true);
    const second = await owner.mutation(api.home.recordVisit, { workspaceId: "ws-a", day: "2026-10-16", now: start + DAY });
    expect(second.sinceAt).toBe(start);
    for (const day of ["2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19"]) {
      await owner.mutation(api.home.saveBriefing, { workspaceId: "ws-a", day, sinceAt: start, facts: { newLeads: 1 } });
    }
    const state = await owner.query(api.home.state, { workspaceId: "ws-a", day: "2026-10-19", now: start + 4 * DAY });
    expect(state.briefings.map((row) => row.day)).toEqual(["2026-10-19", "2026-10-18", "2026-10-17"]);
  });
});
