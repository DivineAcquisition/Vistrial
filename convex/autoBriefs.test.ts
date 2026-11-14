/**
 * @vitest-environment edge-runtime
 *
 * Automatic pre-call briefs (build step 10d): off by default; an Owner or Admin turns them on after
 * confirming the monthly cap; a brief about three hours before each booked call, once per call, within 200
 * briefs and 600 credits a month; one Briefing post a day for the briefs made the day before.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import { AUTO_LIMITS, AUTO_TEXT } from "./autoBriefs";
import { NOT_ALLOWED } from "./lib/errors";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const person = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });
const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 14, 15);

async function message(run: Promise<unknown>) {
  try {
    await run;
  } catch (error) {
    const data = (error as { data?: { message?: unknown } }).data;
    if (data && typeof data.message === "string") return data.message;
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a refusal");
}

async function setup() {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity(person("nora"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Northlight" });
  await t.run(async (ctx) => {
    const agent = (await ctx.db.query("agents").withIndex("by_slug", (q) => q.eq("slug", "sales-conversion")).unique())!;
    await ctx.db.patch(agent._id, { status: "live" });
  });
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: "sales-conversion", state: "on" });
  const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: "milo@example.com", role: "member" });
  const member = t.withIdentity(person("milo"));
  await member.mutation(api.workspace.acceptInvite, { token: invite.token });
  await t.run(async (ctx) => {
    const connectionId = await ctx.db.insert("crmConnections", { workspaceId, provider: "highlevel", status: "connected", accessToken: "token", refreshToken: "refresh", tokenExpiresAt: NOW + DAY, scopes: [], accountId: "loc1", accountName: "Northlight", currency: "USD", timezone: "America/New_York", connectedBy: "nora", connectedAt: NOW - 30 * DAY, lastSyncAt: NOW, callsOk: 0, callsFailed: 0 });
    const base = { workspaceId, connectionId, seenAt: NOW };
    await ctx.db.insert("crmPipelines", { ...base, externalId: "p1", name: "Sales", stages: [{ id: "s1", name: "Booked", position: 0 }] });
    for (const [ref, name] of [["c1", "Jordan Lee"], ["c2", "Sam Ray"]]) {
      await ctx.db.insert("crmContacts", { ...base, externalId: ref, name, tags: [], addedAt: NOW - 5 * DAY });
      await ctx.db.insert("crmDeals", { ...base, externalId: `d-${ref}`, pipelineId: "p1", stageId: "s1", status: "open", value: 3000, contactId: ref });
    }
    // Jordan's call is in two hours: due. Sam's is in five: not yet.
    await ctx.db.insert("crmActivities", { workspaceId, connectionId, externalId: "a1", kind: "appointment", at: NOW + 2 * HOUR, contactId: "c1", status: "booked" });
    await ctx.db.insert("crmActivities", { workspaceId, connectionId, externalId: "a2", kind: "appointment", at: NOW + 5 * HOUR, contactId: "c2", status: "booked" });
  });
  return { t, owner, member, workspaceId };
}

const briefs = (s: Awaited<ReturnType<typeof setup>>) => s.t.run((ctx) => ctx.db.query("dealBriefings").collect());

describe("automatic pre-call briefs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is off by default, shows the cap, and only an Owner or Admin turns it on, after confirming the cap", async () => {
    const s = await setup();
    expect(await s.owner.query(api.autoBriefs.status, { workspaceId: s.workspaceId })).toMatchObject({ on: false, canSet: true, hoursBefore: 3, cap: { briefs: 200, credits: 600 }, used: { briefs: 0, credits: 0 } });
    await s.t.mutation(internal.autoBriefs.sweep, {});
    expect(await briefs(s)).toHaveLength(0);
    expect((await s.member.query(api.autoBriefs.status, { workspaceId: s.workspaceId })).canSet).toBe(false);
    expect(await message(s.member.mutation(api.autoBriefs.setAuto, { workspaceId: s.workspaceId, on: true, confirmedCredits: AUTO_LIMITS.credits }))).toBe(NOT_ALLOWED);
    expect(await message(s.owner.mutation(api.autoBriefs.setAuto, { workspaceId: s.workspaceId, on: true }))).toBe(AUTO_TEXT.confirmCap);
    await s.owner.mutation(api.autoBriefs.setAuto, { workspaceId: s.workspaceId, on: true, confirmedCredits: AUTO_LIMITS.credits });
    expect((await s.owner.query(api.autoBriefs.status, { workspaceId: s.workspaceId })).on).toBe(true);
  });

  it("briefs the call due within three hours once, as the person who turned it on, and posts yesterday's briefs once", async () => {
    const s = await setup();
    await s.owner.mutation(api.autoBriefs.setAuto, { workspaceId: s.workspaceId, on: true, confirmedCredits: AUTO_LIMITS.credits });
    await s.t.mutation(internal.autoBriefs.sweep, {});
    await s.t.mutation(internal.autoBriefs.sweep, {});
    let rows = await briefs(s);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ appointmentRef: "a1", contactRef: "c1", dealRef: "d-c1", trigger: "auto", createdBy: "nora", leadName: "Jordan Lee" });
    expect(await s.t.run(async (ctx) => (await ctx.db.get(rows[0].runId!))?.skillSlug)).toBe("deal-briefing");

    // Three hours later Sam's call is due.
    vi.setSystemTime(NOW + 3 * HOUR);
    await s.t.mutation(internal.autoBriefs.sweep, {});
    rows = await briefs(s);
    expect(rows.map((row) => row.appointmentRef).sort()).toEqual(["a1", "a2"]);

    // The next day: one post for yesterday's two briefs.
    vi.setSystemTime(NOW + DAY);
    await s.t.mutation(internal.autoBriefs.sweep, {});
    await s.t.mutation(internal.autoBriefs.sweep, {});
    const posts = (await s.t.run((ctx) => ctx.db.query("briefingItems").collect())).filter((row) => row.key?.startsWith("dealmaker-autobriefs:"));
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ kind: "finished", title: "Dealmaker · 2 pre-call briefs made automatically yesterday", body: "For calls with Jordan Lee, Sam Ray. Each is in Calls." });
  });

  it("stops at the monthly cap, and when switched off", async () => {
    const s = await setup();
    await s.owner.mutation(api.autoBriefs.setAuto, { workspaceId: s.workspaceId, on: true, confirmedCredits: AUTO_LIMITS.credits });
    await s.t.run(async (ctx) => {
      const projectId = await ctx.db.insert("researchProjects", { workspaceId: s.workspaceId, title: "Brief", objective: "Brief.", market: "", geography: "", competitors: [], platforms: ["customerData"], suppliedUrls: [], status: "draft", createdBy: "nora", createdAt: NOW, updatedAt: NOW });
      for (let i = 0; i < AUTO_LIMITS.briefs; i += 1) await ctx.db.insert("dealBriefings", { workspaceId: s.workspaceId, projectId, leadName: "Earlier", trigger: "auto", status: "ready", createdBy: "nora", createdAt: NOW - HOUR } as never);
    });
    await s.t.mutation(internal.autoBriefs.sweep, {});
    expect((await briefs(s)).filter((row) => row.appointmentRef)).toHaveLength(0);

    const fresh = await setup();
    await fresh.owner.mutation(api.autoBriefs.setAuto, { workspaceId: fresh.workspaceId, on: true, confirmedCredits: AUTO_LIMITS.credits });
    await fresh.owner.mutation(api.autoBriefs.setAuto, { workspaceId: fresh.workspaceId, on: false });
    await fresh.t.mutation(internal.autoBriefs.sweep, {});
    expect(await briefs(fresh)).toHaveLength(0);
  });
});
