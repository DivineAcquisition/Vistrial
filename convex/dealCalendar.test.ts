/**
 * @vitest-environment edge-runtime
 *
 * Dealmaker's Calendar (build step 17): weeks in the business's own time zone, show-rate figures only from
 * enough past calls with an outcome, a brief due for a call within a day, and the week as each person's home
 * shows it.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import { NOT_ENOUGH_DATA, briefBadge, dayKey, showFigures, weekDays } from "./lib/dealmaker/calendar";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const person = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });
const DAY = 86_400_000;
const HOUR = 3_600_000;
// Saturday 14 November 2026, 10:00 in New York.
const NOW = Date.UTC(2026, 10, 14, 15);

describe("calendar rules", () => {
  it("finds the week in the business's own time zone, Monday first", () => {
    expect(weekDays(NOW, "America/New_York")).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
    expect(weekDays(NOW, "America/New_York", 1)[0]).toBe("2026-11-16");
    // 02:00 UTC on Monday the 16th is still Sunday evening in New York.
    expect(dayKey(Date.UTC(2026, 10, 16, 2), "America/New_York")).toBe("2026-11-15");
    expect(dayKey(Date.UTC(2026, 10, 16, 2), null)).toBe("2026-11-16");
  });

  it("gives a show rate only from enough calls with an outcome, never counting an unmarked call as a no-show", () => {
    const at = (daysAgo: number) => NOW - daysAgo * DAY;
    const few = showFigures(
      [
        { startsAt: at(1), status: "showed" },
        { startsAt: at(2), status: "noShow" },
        { startsAt: at(3), status: "booked" },
      ],
      NOW,
    );
    expect(few).toMatchObject({ showed: 1, noShow: 1, notMarked: 1, showRate: NOT_ENOUGH_DATA });
    const enough = showFigures(
      [
        ...[1, 2, 3, 4].map((d) => ({ startsAt: at(d), status: "showed" as const })),
        { startsAt: at(5), status: "noShow" as const },
        { startsAt: at(6), status: "cancelled" as const },
        { startsAt: at(40), status: "noShow" as const },
        { startsAt: NOW + DAY, status: "booked" as const },
      ],
      NOW,
    );
    expect(enough).toMatchObject({ showed: 4, noShow: 1, cancelled: 1, notMarked: 0, showRate: "80%" });
  });

  it("marks a brief due only for a call within a day that has none", () => {
    expect(briefBadge("none", NOW + 3 * HOUR, NOW, "booked")).toBe("due");
    expect(briefBadge("none", NOW + 3 * DAY, NOW, "booked")).toBe("none");
    expect(briefBadge("none", NOW + 3 * HOUR, NOW, "cancelled")).toBe("none");
    expect(briefBadge("none", NOW - HOUR, NOW, "showed")).toBe("none");
    expect(briefBadge("ready", NOW + 3 * HOUR, NOW, "booked")).toBe("ready");
    expect(briefBadge("failed", NOW + 3 * HOUR, NOW, "booked")).toBe("check");
  });
});

describe("the week query", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists the week's calls with their status and brief, today's calls, and figures, as each person's home shows it", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.agents, {});
    const owner = t.withIdentity(person("nora"));
    const workspaceId = await owner.mutation(api.workspace.create, { name: "Northlight" });
    expect(await owner.query(api.dealCalendar.week, { workspaceId })).toMatchObject({ connected: false });
    const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: "milo@example.com", role: "member" });
    const member = t.withIdentity(person("milo"));
    await member.mutation(api.workspace.acceptInvite, { token: invite.token });

    await t.run(async (ctx) => {
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
      const call = (externalId: string, at: number, contactId: string, status: string) =>
        ctx.db.insert("crmActivities", { workspaceId, connectionId, externalId, kind: "appointment", at, contactId, status });
      await call("a1", NOW + 4 * HOUR, "c1", "confirmed"); // today, later
      await call("a2", NOW + 30 * HOUR, "c2", "booked"); // Sunday
      await call("a3", NOW - 2 * DAY, "c1", "showed"); // Thursday
      await call("a4", NOW - 3 * DAY, "c2", "noShow"); // Wednesday
      await call("a5", NOW + 4 * DAY, "c1", "booked"); // next week
      const projectId = await ctx.db.insert("researchProjects", {
        workspaceId,
        title: "Pre-call brief: Sam Ray",
        objective: "Brief.",
        market: "",
        geography: "",
        competitors: [],
        platforms: ["customerData"],
        suppliedUrls: [],
        status: "draft",
        createdBy: "nora",
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("dealBriefings", {
        workspaceId,
        projectId,
        leadName: "Sam Ray",
        contactRef: "c2",
        appointmentRef: "a2",
        trigger: "request",
        status: "ready",
        createdBy: "nora",
        createdAt: NOW - HOUR,
      } as never);
    });

    const all = await owner.query(api.dealCalendar.week, { workspaceId });
    if (!all.connected || !all.appointments) throw new Error("expected a calendar");
    expect(all.days.map((row) => row.key)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
    expect(all.days.find((row) => row.isToday)?.key).toBe("2026-11-14");
    expect(all.todayCalls.map((row) => ({ lead: row.leadName, status: row.statusLabel, brief: row.briefLabel }))).toEqual([{ lead: "Jordan Lee", status: "Confirmed", brief: "Brief due" }]);
    expect(all.days.find((row) => row.key === "2026-11-15")!.calls[0]).toMatchObject({ leadName: "Sam Ray", brief: "ready", stage: "Call booked" });
    expect(
      all.days
        .flatMap((row) => row.calls)
        .map((row) => row.ref)
        .sort(),
    ).toEqual(["a1", "a2", "a3", "a4"]);
    expect(all.figures).toMatchObject({ showed: 1, noShow: 1, showRate: NOT_ENOUGH_DATA, upcoming: 2, confirmed: 1, briefsDue: 1 });

    const next = await owner.query(api.dealCalendar.week, { workspaceId, week: 1 });
    if (!next.connected || !next.appointments) throw new Error("expected a calendar");
    expect(next.days.flatMap((row) => row.calls).map((row) => row.ref)).toEqual(["a5"]);

    // A closer linked to their CRM user sees only their own deals' calls.
    const people = await owner.query(api.settings.people, { workspaceId });
    await owner.mutation(api.dealmakerTeam.setRole, { workspaceId, memberId: people.members.find((row) => row.name === "milo")!.id as never, salesRole: "closer", crmUserRef: "crm-milo" });
    const mine = await member.query(api.dealCalendar.week, { workspaceId });
    if (!mine.connected || !mine.appointments) throw new Error("expected a calendar");
    expect(
      mine.days
        .flatMap((row) => row.calls)
        .map((row) => row.ref)
        .sort(),
    ).toEqual(["a1", "a3"]);
    expect(mine.figures).toMatchObject({ showed: 1, noShow: 0 });
  });
});
