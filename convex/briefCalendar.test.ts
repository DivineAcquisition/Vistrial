/**
 * @vitest-environment edge-runtime
 *
 * The brief link on a booked call's Google Calendar event (Dealmaker, 0.10 item 5): off by default, only an Owner
 * turns it on, "Not set up yet" without Google configured, the extra permission asked for only then, and one
 * line added to the matching event without notifying its guests.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { linkLine, withLink } from "./briefCalendar";
import { CALENDAR_LINK_SCOPE } from "./lib/integrations/providers";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 14, 15);
const CALL = NOW + DAY;

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

async function setup(options: { calendar?: "none" | "readonly" | "write" } = {}) {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity(person("dana"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Northpeak" });
  const briefingId = await t.run(async (ctx) => {
    const connectionId = await ctx.db.insert("crmConnections", { workspaceId, provider: "highlevel", status: "connected", accessToken: "t", refreshToken: "r", tokenExpiresAt: NOW + DAY, scopes: [], accountId: "loc1", accountName: "Aster", currency: "USD", connectedBy: "dana", connectedAt: NOW, callsOk: 0, callsFailed: 0 });
    await ctx.db.insert("crmContacts", { workspaceId, connectionId, seenAt: NOW, externalId: "c1", name: "Jordan Lee", email: "Jordan@JordanCo.com", tags: [] });
    if (options.calendar && options.calendar !== "none") {
      await ctx.db.insert("integrationConnections", {
        workspaceId,
        provider: "google_calendar",
        status: "connected",
        accessToken: "gcal-token",
        tokenExpiresAt: NOW + DAY,
        scopes: ["https://www.googleapis.com/auth/calendar.events.owned.readonly", ...(options.calendar === "write" ? [CALENDAR_LINK_SCOPE] : [])],
        accountId: "dana@example.com",
        accountLabel: "dana@example.com",
        connectedBy: "dana",
        connectedAt: NOW,
      });
    }
    const projectId = await ctx.db.insert("researchProjects", { workspaceId, title: "Pre-call brief", objective: "", market: "", geography: "", competitors: [], platforms: ["customerData"], suppliedUrls: [], status: "draft", createdBy: "dana", createdAt: NOW, updatedAt: NOW });
    return ctx.db.insert("dealBriefings", { workspaceId, projectId, contactRef: "c1", appointmentRef: "a1", startsAt: CALL, leadName: "Jordan Lee", trigger: "request", status: "ready", createdBy: "dana", createdAt: NOW });
  });
  return { t, owner, workspaceId, briefingId };
}

describe("brief links on the calendar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "client-secret");
    vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("adds one line, and never twice", () => {
    expect(withLink(null, "https://x/brief")).toBe(linkLine("https://x/brief"));
    expect(withLink("Agenda: intro", "https://x/brief")).toBe(`Agenda: intro\n\n${linkLine("https://x/brief")}`);
    expect(withLink(`Agenda\n\n${linkLine("https://x/brief")}`, "https://x/brief")).toBeNull();
  });

  it("says Not set up yet without Google sign-in, then what stands in the way, and is off by default", async () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "");
    const bare = await setup({ calendar: "write" });
    expect(await bare.owner.query(api.briefCalendar.status, { workspaceId: bare.workspaceId })).toMatchObject({ state: "notSetUp", canChange: true });
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
    const none = await setup({ calendar: "none" });
    expect((await none.owner.query(api.briefCalendar.status, { workspaceId: none.workspaceId })).state).toBe("noCalendar");
    const counts = await setup({ calendar: "readonly" });
    expect((await counts.owner.query(api.briefCalendar.status, { workspaceId: counts.workspaceId })).state).toBe("needsPermission");
    const ready = await setup({ calendar: "write" });
    expect((await ready.owner.query(api.briefCalendar.status, { workspaceId: ready.workspaceId })).state).toBe("off");
    await ready.owner.mutation(api.briefCalendar.setLinks, { workspaceId: ready.workspaceId, on: true });
    expect((await ready.owner.query(api.briefCalendar.status, { workspaceId: ready.workspaceId })).state).toBe("on");
  });

  it("lets only an Owner turn it on, or ask Google for the permission", async () => {
    const s = await setup({ calendar: "readonly" });
    const invite = await s.owner.mutation(api.workspace.invite, { workspaceId: s.workspaceId, email: "ada@example.com", role: "admin" });
    const ada = s.t.withIdentity(person("ada"));
    await ada.mutation(api.workspace.acceptInvite, { token: invite.token });
    await expect(ada.mutation(api.briefCalendar.setLinks, { workspaceId: s.workspaceId, on: true })).rejects.toThrow(/Only an Owner/);
    await expect(ada.mutation(api.integrations.startConnect, { workspaceId: s.workspaceId, provider: "google_calendar", briefLinks: true })).rejects.toThrow(/Only an Owner/);
    // The Owner's sign-in asks for the extra permission; an ordinary connect does not.
    const withLinks = await s.owner.mutation(api.integrations.startConnect, { workspaceId: s.workspaceId, provider: "google_calendar", briefLinks: true });
    const scopes = (url: string) => (new URL(url).searchParams.get("scope") ?? "").split(" ");
    expect(scopes(withLinks.url)).toContain(CALENDAR_LINK_SCOPE);
    const plain = await s.owner.mutation(api.integrations.startConnect, { workspaceId: s.workspaceId, provider: "google_calendar" });
    expect(scopes(plain.url)).not.toContain(CALENDAR_LINK_SCOPE);
  });

  it("adds the link to the event with the lead as a guest, without notifying guests, once the Owner turned it on", async () => {
    const s = await setup({ calendar: "write" });
    const calls: { method: string; url: string; body?: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      calls.push({ method: init.method ?? "GET", url, ...(typeof init.body === "string" ? { body: init.body } : {}) });
      if ((init.method ?? "GET") === "GET") {
        return new Response(JSON.stringify({ items: [
          { id: "other", start: { dateTime: new Date(CALL).toISOString() }, attendees: [{ email: "someone@else.com" }] },
          { id: "ev1", start: { dateTime: new Date(CALL).toISOString() }, description: "Zoom link here", attendees: [{ email: "jordan@jordanco.com" }] },
        ] }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    // Off by default: nothing is read or changed.
    await s.t.action(internal.briefCalendar.addLink, { briefingId: s.briefingId });
    expect(calls).toEqual([]);
    await s.owner.mutation(api.briefCalendar.setLinks, { workspaceId: s.workspaceId, on: true });
    await s.t.action(internal.briefCalendar.addLink, { briefingId: s.briefingId });
    expect(calls.map((row) => row.method)).toEqual(["GET", "PATCH"]);
    expect(calls[1].url).toContain("/events/ev1?sendUpdates=none");
    expect(JSON.parse(calls[1].body!).description).toMatch(/^Zoom link here\n\nPre-call brief \(Vistrial\): https:\/\/.+\/app\/agents\/sales-conversion\/work\/calls\?brief=/);
    const row = await s.t.run((ctx) => ctx.db.get(s.briefingId as Id<"dealBriefings">));
    expect(row?.calendarLink?.state).toBe("added");
    // Done once: a second pass changes nothing.
    await s.t.action(internal.briefCalendar.addLink, { briefingId: s.briefingId });
    expect(calls).toHaveLength(2);
  });

  it("records that no event matched, and touches nothing", async () => {
    const s = await setup({ calendar: "write" });
    const methods: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit = {}) => {
      methods.push(init.method ?? "GET");
      return new Response(JSON.stringify({ items: [{ id: "x", start: { dateTime: new Date(CALL).toISOString() }, attendees: [{ email: "someone@else.com" }] }] }), { status: 200 });
    });
    await s.owner.mutation(api.briefCalendar.setLinks, { workspaceId: s.workspaceId, on: true });
    await s.t.action(internal.briefCalendar.addLink, { briefingId: s.briefingId });
    expect(methods).toEqual(["GET"]);
    expect((await s.t.run((ctx) => ctx.db.get(s.briefingId as Id<"dealBriefings">)))?.calendarLink?.state).toBe("noEvent");
  });
});
