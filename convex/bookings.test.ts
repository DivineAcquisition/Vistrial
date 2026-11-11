/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { describeBookings, noShowCandidates, outsideGuests, summarizeCalendly, summarizeGoogle, weekOf } from "./lib/integrations/bookings";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const ENV = ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "CALENDLY_CLIENT_ID", "CALENDLY_CLIENT_SECRET", "CONVEX_SITE_URL"];
const NOW = Date.UTC(2026, 10, 11, 12); // Wednesday 11 November 2026

beforeEach(() => {
  for (const name of ENV) process.env[name] = name.endsWith("URL") ? "https://example.convex.site" : "set";
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});
afterEach(() => {
  for (const name of ENV) delete process.env[name];
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function setUp() {
  const t = convexTest(schema, modules);
  const workspaceId = await t.mutation(internal.reviewer.setUpReviewerWorkspace, { userId: "user_owner" });
  const otherWorkspace = await t.run(async (ctx) => {
    await ctx.db.insert("members", { workspaceId, userId: "user_rep", role: "rep", displayName: "Rep", active: true });
    await ctx.db.insert("members", { workspaceId, userId: "user_manager", role: "manager", displayName: "Manager", active: true });
    const other = await ctx.db.insert("workspaces", { name: "Other agency", slug: "other", timezone: "UTC", status: "active", createdAt: 0 });
    await ctx.db.insert("members", { workspaceId: other, userId: "user_other", role: "owner", displayName: "Other", active: true });
    return other;
  });
  const as = (subject: string) => t.withIdentity({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });
  return { t, workspaceId, otherWorkspace, owner: as("user_owner"), manager: as("user_manager"), rep: as("user_rep"), stranger: as("user_other") };
}

async function connect(t: ReturnType<typeof convexTest>, workspaceId: Id<"workspaces">, provider: string) {
  await t.mutation(internal.integrations.saveConnection, {
    workspaceId,
    provider,
    accessToken: "SECRET-ACCESS",
    refreshToken: "SECRET-REFRESH",
    tokenExpiresAt: NOW + 3_600_000,
    scopes: [],
    accountId: provider === "calendly" ? "https://api.calendly.com/users/U1" : "g-1",
    accountLabel: "dana@northpeak.agency",
    connectedBy: "user_owner",
  });
}

type Call = { url: string; auth: string | undefined };
function fake(answer: (url: URL) => { status?: number; json?: unknown }) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (input: string | URL, init?: { headers?: Record<string, string> }) => {
    calls.push({ url: String(input), auth: init?.headers?.Authorization });
    const { status = 200, json = {} } = answer(new URL(String(input)));
    return new Response(JSON.stringify(json), { status });
  });
  return calls;
}

const guest = (email: string, responseStatus = "accepted") => ({ email, responseStatus });
const me = { email: "dana@northpeak.agency", self: true, responseStatus: "accepted" };
const GOOGLE_EVENTS = [
  // Week of 2 November: two sales calls, one cancelled.
  { status: "confirmed", eventType: "default", start: { dateTime: "2026-11-03T15:00:00Z" }, summary: "Intro with Priya (Harbor Dental)", attendees: [me, guest("priya@harbordental.example")] },
  { status: "cancelled", eventType: "default", start: { dateTime: "2026-11-05T15:00:00Z" }, attendees: [me, guest("sam@lakesidelaw.example")] },
  // Week of 9 November: one the guest declined, one still to come.
  { status: "confirmed", start: { dateTime: "2026-11-09T10:00:00-05:00" }, attendees: [me, guest("lee@brightpath.example", "declined")] },
  { status: "confirmed", start: { dateTime: "2026-11-13T17:00:00Z" }, attendees: [me, guest("ana@gmail.com", "needsAction")] },
  // Not calls with outside guests: a team meeting, a solo block, an all-day entry, focus time, a room.
  { status: "confirmed", start: { dateTime: "2026-11-04T09:00:00Z" }, attendees: [me, guest("kai@northpeak.agency")] },
  { status: "confirmed", start: { dateTime: "2026-11-04T11:00:00Z" } },
  { status: "confirmed", start: { date: "2026-11-06" }, attendees: [me, guest("priya@harbordental.example")] },
  { status: "confirmed", eventType: "focusTime", start: { dateTime: "2026-11-06T09:00:00Z" }, attendees: [me, guest("x@other.example")] },
  { status: "confirmed", start: { dateTime: "2026-11-06T13:00:00Z" }, attendees: [me, { email: "room-1@resource.calendar.google.com", resource: true }] },
];

describe("booking counts", () => {
  it("puts a moment in the week that starts on its Monday, in UTC", () => {
    expect(weekOf("2026-11-11T12:00:00Z")).toBe("2026-11-09");
    expect(weekOf("2026-11-09T00:00:00Z")).toBe("2026-11-09");
    expect(weekOf("2026-11-08T23:59:59Z")).toBe("2026-11-02");
    expect(weekOf("not a date")).toBeNull();
    expect(weekOf(undefined)).toBeNull();
  });

  it("counts a guest as outside unless they are the owner, a room or a colleague on the owner's own domain", () => {
    const event = { attendees: [me, guest("kai@northpeak.agency"), guest("priya@harbordental.example"), { email: "r@resource.calendar.google.com", resource: true }] };
    expect(outsideGuests(event, "dana@northpeak.agency").map((row) => row.email)).toEqual(["priya@harbordental.example"]);
    // Two people on a public mail domain are not colleagues.
    expect(outsideGuests({ attendees: [{ email: "dana@gmail.com", self: true }, guest("ana@gmail.com")] }, "dana@gmail.com")).toHaveLength(1);
  });

  it("reduces Google Calendar events to weekly counts with nothing about who or what", () => {
    const snapshot = summarizeGoogle(GOOGLE_EVENTS, "dana@northpeak.agency", NOW, false);
    expect(snapshot.weeks).toEqual([
      { week: "2026-11-02", booked: 2, cancelled: 1, declined: 0 },
      { week: "2026-11-09", booked: 2, cancelled: 0, declined: 1 },
    ]);
    expect(snapshot.totals).toEqual({ booked: 4, cancelled: 1, declined: 1 });
    expect(snapshot).toMatchObject({ from: "2026-08-13", to: "2026-12-11", truncated: false });
    expect(JSON.stringify(snapshot)).not.toMatch(/@|Priya|Harbor|Intro/);
    expect(describeBookings("Google Calendar", snapshot)).toBe("Google Calendar, 2026-08-13 to 2026-12-11: 4 booked, 1 cancelled, 1 declined by the guest.");
  });

  it("reduces Calendly events to weekly and per-type counts, with no-shows only where one was marked", () => {
    const events = [
      { uri: "e1", name: "Discovery call", status: "active", start_time: "2026-11-03T15:00:00Z" },
      { uri: "e2", name: "Discovery call", status: "canceled", start_time: "2026-11-04T15:00:00Z" },
      { uri: "e3", name: "Strategy session", status: "active", start_time: "2026-11-10T15:00:00Z" },
      { uri: "e4", name: "Discovery call", status: "active", start_time: "2026-11-20T15:00:00Z" },
    ];
    const candidates = noShowCandidates(events, NOW, 30);
    // Only past calls that were not cancelled can have a no-show, newest first.
    expect(candidates).toEqual({ check: ["e3", "e1"], of: 2 });
    expect(noShowCandidates(events, NOW, 1)).toEqual({ check: ["e3"], of: 2 });
    const snapshot = summarizeCalendly(events, new Set(["e3"]), { checked: 2, of: 2 }, NOW, false);
    expect(snapshot.weeks).toEqual([
      { week: "2026-11-02", booked: 2, cancelled: 1, noShow: 0 },
      { week: "2026-11-09", booked: 1, cancelled: 0, noShow: 1 },
      { week: "2026-11-16", booked: 1, cancelled: 0, noShow: 0 },
    ]);
    expect(snapshot.totals).toEqual({ booked: 4, cancelled: 1, noShow: 1 });
    expect(snapshot.byType).toEqual([
      { name: "Discovery call", booked: 3, cancelled: 1, noShow: 0 },
      { name: "Strategy session", booked: 1, cancelled: 0, noShow: 1 },
    ]);
    expect(JSON.stringify(snapshot)).not.toContain("e3");
  });
});

describe("reading a connected calendar", () => {
  it("reads Google Calendar without asking for titles or names, pages through, and saves counts only", async () => {
    const { t, workspaceId, owner, rep } = await setUp();
    await connect(t, workspaceId, "google_calendar");
    const calls = fake((url) =>
      url.searchParams.get("pageToken") ? { json: { items: GOOGLE_EVENTS.slice(5) } } : { json: { items: GOOGLE_EVENTS.slice(0, 5), nextPageToken: "p2" } },
    );
    expect(await owner.action(api.bookings.syncNow, { workspaceId, provider: "google_calendar" })).toEqual({ code: "ok" });

    expect(calls).toHaveLength(2);
    const first = new URL(calls[0].url);
    expect(first.origin + first.pathname).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    expect(calls[0].auth).toBe("Bearer SECRET-ACCESS");
    expect(first.searchParams.get("fields")).toBe("nextPageToken,items(status,eventType,start(dateTime,date),attendees(email,self,resource,responseStatus))");
    expect(first.searchParams.get("fields")).not.toMatch(/summary|description|location|displayName/);
    expect(first.searchParams.get("timeMin")).toBe("2026-08-13T12:00:00.000Z");
    expect(first.searchParams.get("timeMax")).toBe("2026-12-11T12:00:00.000Z");

    const shown = await rep.query(api.bookings.view, { workspaceId });
    expect(shown.canRefresh).toBe(false);
    expect(shown.calendars).toHaveLength(1);
    expect(shown.calendars[0].snapshot.totals).toEqual({ booked: 4, cancelled: 1, declined: 1 });
    // Nothing that names a person or a meeting is stored anywhere.
    const stored = await t.run(async (ctx) => JSON.stringify(await ctx.db.query("integrationSnapshots").collect()));
    expect(stored).not.toMatch(/@|harbordental|Priya|Intro|SECRET/);
    const connection = (await owner.query(api.integrations.list, { workspaceId })).providers.find((row) => row.key === "google_calendar")?.connection;
    expect(connection).toMatchObject({ lastSyncCode: "ok", status: "connected" });
  });

  it("reads Calendly for the connected person only, checks recent past calls for a no-show mark, and saves counts only", async () => {
    const { t, workspaceId, manager } = await setUp();
    await connect(t, workspaceId, "calendly");
    const base = "https://api.calendly.com/scheduled_events";
    const calls = fake((url) => {
      if (url.pathname.endsWith("/invitees")) {
        const marked = url.pathname.includes("/E3/");
        return { json: { collection: [{ email: "prospect@example.com", name: "Priya Shah", no_show: marked ? { uri: "x", created_at: "2026-11-10T16:00:00Z" } : null }] } };
      }
      return {
        json: {
          collection: [
            { uri: `${base}/E1`, name: "Discovery call", status: "active", start_time: "2026-11-03T15:00:00Z", location: { join_url: "https://zoom.example/secret" } },
            { uri: `${base}/E2`, name: "Discovery call", status: "canceled", start_time: "2026-11-04T15:00:00Z" },
            { uri: `${base}/E3`, name: "Strategy session", status: "active", start_time: "2026-11-10T15:00:00Z" },
            { uri: `${base}/E4`, name: "Discovery call", status: "active", start_time: "2026-11-20T15:00:00Z" },
          ],
          pagination: { next_page: null },
        },
      };
    });
    expect(await manager.action(api.bookings.syncNow, { workspaceId, provider: "calendly" })).toEqual({ code: "ok" });
    const list = new URL(calls[0].url);
    expect(list.searchParams.get("user")).toBe("https://api.calendly.com/users/U1");
    expect(list.searchParams.has("organization")).toBe(false);
    expect(calls.slice(1).map((call) => new URL(call.url).pathname)).toEqual(["/scheduled_events/E3/invitees", "/scheduled_events/E1/invitees"]);

    const shown = await manager.query(api.bookings.view, { workspaceId });
    expect(shown.canRefresh).toBe(true);
    expect(shown.calendars[0].snapshot).toMatchObject({ totals: { booked: 4, cancelled: 1, noShow: 1 }, noShowChecked: { checked: 2, of: 2 } });
    const stored = await t.run(async (ctx) => JSON.stringify(await ctx.db.query("integrationSnapshots").collect()));
    expect(stored).not.toMatch(/@|Priya|zoom\.example|scheduled_events|SECRET/);
  });

  it("keeps what it counted when Calendly's limit is reached part-way, and says how many calls were checked", async () => {
    const { t, workspaceId, owner } = await setUp();
    await connect(t, workspaceId, "calendly");
    const base = "https://api.calendly.com/scheduled_events";
    let invitees = 0;
    fake((url) => {
      if (url.pathname.endsWith("/invitees")) return ++invitees > 1 ? { status: 429 } : { json: { collection: [{ no_show: null }] } };
      return { json: { collection: [1, 2, 3].map((n) => ({ uri: `${base}/E${n}`, name: "Discovery call", status: "active", start_time: `2026-11-0${n + 1}T15:00:00Z` })), pagination: {} } };
    });
    expect(await owner.action(api.bookings.syncNow, { workspaceId, provider: "calendly" })).toEqual({ code: "ok" });
    const shown = await owner.query(api.bookings.view, { workspaceId });
    expect(shown.calendars[0].snapshot).toMatchObject({ totals: { booked: 3, cancelled: 0, noShow: 0 }, noShowChecked: { checked: 1, of: 3 } });
  });

  it("asks for a reconnect when the provider refuses the token, and keeps the last counts", async () => {
    const { t, workspaceId, owner } = await setUp();
    await connect(t, workspaceId, "google_calendar");
    fake(() => ({ json: { items: GOOGLE_EVENTS } }));
    await owner.action(api.bookings.syncNow, { workspaceId, provider: "google_calendar" });
    fake(() => ({ status: 401, json: { error: { message: "Invalid Credentials" } } }));
    expect(await owner.action(api.bookings.syncNow, { workspaceId, provider: "google_calendar" })).toEqual({ code: "token_rejected" });
    const list = await owner.query(api.integrations.list, { workspaceId });
    expect(list.providers.find((row) => row.key === "google_calendar")?.connection).toMatchObject({ status: "needsReconnect", lastSyncCode: "token_rejected" });
    expect(JSON.stringify(list)).not.toContain("Invalid Credentials");
    expect((await owner.query(api.bookings.view, { workspaceId })).calendars[0].snapshot.totals.booked).toBe(4);
  });

  it("lets only an owner or manager of that workspace refresh, and only a calendar", async () => {
    const { t, workspaceId, owner, rep, stranger } = await setUp();
    await connect(t, workspaceId, "google_calendar");
    const calls = fake(() => ({ json: { items: [] } }));
    await expect(rep.action(api.bookings.syncNow, { workspaceId, provider: "google_calendar" })).rejects.toThrow();
    await expect(stranger.action(api.bookings.syncNow, { workspaceId, provider: "google_calendar" })).rejects.toThrow();
    await expect(owner.action(api.bookings.syncNow, { workspaceId, provider: "google_ads" })).rejects.toThrow(/not a calendar/);
    await expect(owner.action(api.bookings.syncNow, { workspaceId, provider: "calendly" })).rejects.toThrow(/Connect it first/);
    await expect(stranger.query(api.bookings.view, { workspaceId })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("deletes the counts on disconnect, and a scheduled read touches only connected calendars", async () => {
    const { t, workspaceId, otherWorkspace, owner, stranger } = await setUp();
    await connect(t, workspaceId, "google_calendar");
    await connect(t, otherWorkspace, "google_calendar");
    fake((url) => (url.hostname === "oauth2.googleapis.com" ? {} : { json: { items: GOOGLE_EVENTS } }));
    expect(await t.action(internal.bookings.syncAll, {})).toEqual({ synced: 2 });
    await owner.action(api.integrationActions.disconnect, { workspaceId, provider: "google_calendar" });
    expect((await owner.query(api.bookings.view, { workspaceId })).calendars).toHaveLength(0);
    expect((await stranger.query(api.bookings.view, { workspaceId: otherWorkspace })).calendars).toHaveLength(1);
    expect(await t.action(internal.bookings.syncAll, {})).toEqual({ synced: 1 });
  });

  it("reads a calendar once straight after it is connected", async () => {
    const { t, workspaceId, owner } = await setUp();
    vi.useRealTimers();
    const { url } = await owner.mutation(api.integrations.startConnect, { workspaceId, provider: "calendly" });
    fake((target) => {
      if (target.pathname === "/oauth/token") return { json: { access_token: "CAL-ACCESS", refresh_token: "R", expires_in: 7200 } };
      if (target.pathname === "/users/me") return { json: { resource: { uri: "https://api.calendly.com/users/U1", email: "dana@northpeak.agency" } } };
      return { json: { collection: [{ uri: "https://api.calendly.com/scheduled_events/E9", name: "Discovery call", status: "active", start_time: new Date(Date.now() + 86_400_000).toISOString() }], pagination: {} } };
    });
    vi.useFakeTimers();
    const response = await t.fetch(`/integrations/calendly/callback?state=${new URL(url).searchParams.get("state")}&code=c`);
    expect(response.headers.get("Location")).toContain("outcome=connected");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    expect((await owner.query(api.bookings.view, { workspaceId })).calendars[0]).toMatchObject({ provider: "calendly", snapshot: { totals: { booked: 1 } } });
  });
});
