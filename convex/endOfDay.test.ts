/**
 * @vitest-environment edge-runtime
 *
 * End-of-day reports (build step 12d): today's calls by outcome in the business's own time zone, what is
 * still open, tomorrow's calls, a row per rep for an Owner or Admin only, and one Briefing post each evening
 * with no person's name.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import { byRep, endOfDay, localHour, type DayCall } from "./lib/dealmaker/endOfDay";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const person = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });
const DAY = 86_400_000;
const HOUR = 3_600_000;
// Saturday 14 November 2026, 16:00 in New York.
const NOW = Date.UTC(2026, 10, 14, 21);

const call = (over: Partial<DayCall>): DayCall => ({ startsAt: NOW - HOUR, status: "showed", repRef: null, noted: false, reviewed: false, briefed: false, ...over });

describe("end-of-day rules", () => {
  it("counts today's calls by outcome, never an unmarked call as a no-show, and lists what is open", () => {
    const report = endOfDay({
      now: NOW,
      today: [
        call({ noted: true, reviewed: true }),
        call({ noted: true }),
        call({}),
        call({ status: "noShow" }),
        call({ status: "booked" }),
        call({ status: "cancelled" }),
        call({ status: "confirmed", startsAt: NOW + HOUR }),
      ],
      tomorrow: [call({ startsAt: NOW + DAY, status: "booked", briefed: true }), call({ startsAt: NOW + DAY, status: "booked" }), call({ startsAt: NOW + DAY, status: "cancelled" })],
      briefsMade: 2,
      messagesSent: 3,
      draftsWaiting: 1,
      commitmentsDue: 2,
    });
    expect(report.figures).toEqual({ calls: 6, held: 3, noShow: 1, cancelled: 1, notMarked: 1, later: 1 });
    expect(report.done).toEqual({ briefs: 2, notes: 2, reviews: 1, sent: 3 });
    expect(report.tomorrow).toEqual({ calls: 2, withoutBrief: 1 });
    expect(report.open).toEqual([
      "Mark 1 call as held or no-show in your CRM.",
      "Add notes for 1 held call.",
      "1 held call with notes has no review yet.",
      "1 message waits in Comms.",
      "2 promises to a lead are due or overdue.",
      "1 call tomorrow has no brief yet.",
    ]);
    expect(report.headline).toBe("6 booked calls today: 3 held, 1 no-show, 1 not marked, 1 later. 2 calls tomorrow.");
    expect(endOfDay({ now: NOW, today: [], tomorrow: [], briefsMade: 0, messagesSent: 0, draftsWaiting: 0, commitmentsDue: 0 })).toMatchObject({
      open: [],
      headline: "No booked calls today. 0 calls tomorrow.",
    });
  });

  it("gives a row per rep from past calls only, unassigned last", () => {
    const names: Record<string, string> = { r1: "Milo", r2: "Ada" };
    const rows = byRep(
      [call({ repRef: "r1", noted: true }), call({ repRef: "r1", status: "noShow" }), call({ repRef: "r2", status: "booked" }), call({ repRef: null }), call({ repRef: "r2", startsAt: NOW + HOUR })],
      NOW,
      (ref) => names[ref] ?? null,
    );
    expect(rows).toEqual([
      { name: "Ada", held: 0, noShow: 0, notMarked: 1, noted: 0 },
      { name: "Milo", held: 1, noShow: 1, notMarked: 0, noted: 1 },
      { name: "Not assigned", held: 1, noShow: 0, notMarked: 0, noted: 0 },
    ]);
  });

  it("reads the local hour in the business's time zone", () => {
    expect(localHour(NOW, "America/New_York")).toBe(16);
    expect(localHour(NOW, null)).toBe(21);
    expect(localHour(NOW, "Not/AZone")).toBe(21);
  });
});

describe("the report and the evening post", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows each person's home, gives per-rep rows to an Owner only, and posts once after 18:00 with no names", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.agents, {});
    const owner = t.withIdentity(person("nora"));
    const workspaceId = await owner.mutation(api.workspace.create, { name: "Northlight" });
    expect(await owner.query(api.endOfDay.today, { workspaceId })).toMatchObject({ connected: false });
    const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: "milo@example.com", role: "member" });
    const member = t.withIdentity(person("milo"));
    await member.mutation(api.workspace.acceptInvite, { token: invite.token });

    await t.run(async (ctx) => {
      const agent = (await ctx.db
        .query("agents")
        .withIndex("by_slug", (q) => q.eq("slug", "sales-conversion"))
        .unique())!;
      await ctx.db.patch(agent._id, { status: "live" });
      const connectionId = await ctx.db.insert("crmConnections", {
        workspaceId,
        provider: "highlevel",
        status: "connected",
        accessToken: "token",
        refreshToken: "refresh",
        tokenExpiresAt: NOW + DAY,
        scopes: [],
        accountId: "loc1",
        accountName: "Northlight",
        currency: "USD",
        timezone: "America/New_York",
        connectedBy: "nora",
        connectedAt: NOW - 60 * DAY,
        lastSyncAt: NOW,
        callsOk: 0,
        callsFailed: 0,
      });
      const base = { workspaceId, connectionId, seenAt: NOW };
      await ctx.db.insert("crmPipelines", { ...base, externalId: "p1", name: "Sales", stages: [{ id: "s1", name: "Call booked", position: 0 }] });
      await ctx.db.insert("crmDeals", { ...base, externalId: "d1", pipelineId: "p1", stageId: "s1", status: "open", value: 3000, contactId: "c1", assignedTo: "crm-milo" });
      await ctx.db.insert("crmDeals", { ...base, externalId: "d2", pipelineId: "p1", stageId: "s1", status: "open", value: 3000, contactId: "c2", assignedTo: "crm-ada" });
      await ctx.db.insert("crmContacts", { ...base, externalId: "c1", name: "Jordan Lee", tags: [], addedAt: NOW - 10 * DAY });
      await ctx.db.insert("crmContacts", { ...base, externalId: "c2", name: "Sam Ray", tags: [], addedAt: NOW - 10 * DAY });
      const appointment = (externalId: string, at: number, contactId: string, status: string) =>
        ctx.db.insert("crmActivities", { workspaceId, connectionId, externalId, kind: "appointment", at, contactId, status });
      await appointment("a1", NOW - 5 * HOUR, "c1", "showed"); // 11:00 today
      await appointment("a2", NOW - 3 * HOUR, "c2", "noShow"); // 13:00 today
      await appointment("a3", NOW + 20 * HOUR, "c1", "booked"); // tomorrow
      await appointment("a4", NOW - 20 * HOUR, "c2", "showed"); // yesterday
      await ctx.db.insert("callNotes", {
        workspaceId,
        contactRef: "c1",
        appointmentRef: "a1",
        leadName: "Jordan Lee",
        outcome: "thinking",
        fit: [],
        objections: [],
        writtenBy: "Milo",
        createdBy: "milo",
        createdAt: NOW - 4 * HOUR,
      } as never);
      await ctx.db.insert("dealCommitments", { workspaceId, dealRef: "d1", text: "Send the case study", owner: "lead", due: NOW - HOUR, createdBy: "milo", createdAt: NOW - DAY });
    });
    await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: "sales-conversion", state: "on" });
    const people = await owner.query(api.settings.people, { workspaceId });
    await owner.mutation(api.dealmakerTeam.setRole, { workspaceId, memberId: people.members.find((row) => row.name === "milo")!.id as never, salesRole: "closer", crmUserRef: "crm-milo" });

    const all = await owner.query(api.endOfDay.today, { workspaceId });
    if (!all.connected || !all.appointments) throw new Error("expected a report");
    expect(all.figures).toMatchObject({ calls: 2, held: 1, noShow: 1, notMarked: 0 });
    expect(all.done.notes).toBe(1);
    expect(all.tomorrow).toEqual({ calls: 1, withoutBrief: 1 });
    expect(all.open).toContain("1 promise to a lead is due or overdue.");
    expect(all.reps).toEqual(
      [
        { name: "milo", held: 1, noShow: 0, notMarked: 0, noted: 1 },
        { name: "CRM user 1", held: 0, noShow: 1, notMarked: 0, noted: 0 },
      ].sort((a, b) => a.name.localeCompare(b.name)),
    );

    const mine = await member.query(api.endOfDay.today, { workspaceId });
    if (!mine.connected || !mine.appointments) throw new Error("expected a report");
    expect(mine.figures).toMatchObject({ calls: 1, held: 1, noShow: 0 });
    expect(mine.reps).toBeNull();

    // Before 18:00 local, nothing is posted; after it, one post, and only one.
    expect(await t.mutation(internal.endOfDay.sweep, {})).toEqual({ posted: 0 });
    vi.setSystemTime(NOW + 3 * HOUR);
    expect(await t.mutation(internal.endOfDay.sweep, {})).toEqual({ posted: 1 });
    vi.setSystemTime(NOW + 4 * HOUR);
    expect(await t.mutation(internal.endOfDay.sweep, {})).toEqual({ posted: 0 });
    const posts = await t.run((ctx) => ctx.db.query("briefingItems").collect());
    const report = posts.filter((row) => row.title === "Dealmaker · End of day");
    expect(report).toHaveLength(1);
    expect(report[0].body).toContain("2 booked calls today: 1 held, 1 no-show.");
    expect(report[0].body).not.toMatch(/milo|Jordan|Sam/i);
  });
});
