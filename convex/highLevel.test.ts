/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { HL_SCOPES } from "./lib/highLevel";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const ENV = ["HIGHLEVEL_CLIENT_ID", "HIGHLEVEL_CLIENT_SECRET", "HIGHLEVEL_CALL_GAP_MS", "CONVEX_SITE_URL", "SITE_URL"];
const DAY = 86_400_000;
const LOCATION = "locAAAA1111";

/**
 * A fake HighLevel. It answers the read endpoints Vistrial uses with fixed data, records every request, and
 * can be told to refuse. No real HighLevel is reached in any test.
 */
function fakeHighLevel(
  options: {
    userType?: string;
    scope?: string;
    refresh?: "ok" | "invalid_grant";
    rateLimitAt?: string;
    stage?: string;
    status?: string;
    /** The lead's own time zone, from a fresh read. Null means HighLevel has none. */
    leadTimezone?: string | null;
    dnd?: boolean;
    smsDnd?: "active" | "inactive";
    /** Every write is refused with this status. */
    failWrites?: number;
  } = {},
) {
  const calls: { method: string; path: string; body: string | null; auth: string | null }[] = [];
  let tokenCount = 0;
  const now = Date.now();
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "x-ratelimit-remaining": "90" } });
  const fake = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : null;
    const auth = new Headers(init?.headers).get("authorization");
    calls.push({ method, path: url.pathname, body, auth });
    if (url.origin !== "https://services.leadconnectorhq.com") return json({ message: "unknown host" }, 404);
    if (options.rateLimitAt && url.pathname.startsWith(options.rateLimitAt)) return json({ statusCode: 429, message: "Too many requests" }, 429);
    const p = url.pathname;
    if (p === "/oauth/token") {
      const form = new URLSearchParams(body ?? "");
      if (form.get("grant_type") === "refresh_token" && options.refresh === "invalid_grant") return json({ error: "invalid_grant" }, 400);
      tokenCount++;
      return json({
        access_token: `ACCESS-TOKEN-${tokenCount}`,
        refresh_token: `REFRESH-TOKEN-${tokenCount}`,
        expires_in: 86399,
        token_type: "Bearer",
        scope: options.scope ?? HL_SCOPES.join(" "),
        userType: options.userType ?? "Location",
        locationId: options.userType === "Company" ? undefined : LOCATION,
        companyId: "compBBBB2222",
        userId: "hluser1",
      });
    }
    if (p === `/locations/${LOCATION}`) return json({ location: { id: LOCATION, name: "Northlight Cleaning", currency: "USD", timezone: "America/Chicago" } });
    if (p === "/opportunities/pipelines") {
      return json({ pipelines: [{ id: "pipe1", name: "Sales", stages: [{ id: "stNew", name: "New lead", position: 0 }, { id: "stBooked", name: "Booked", position: 1 }, { id: "stWon", name: "Won", position: 2 }] }] });
    }
    if (p === "/opportunities/search") {
      return json({
        opportunities: [
          {
            id: "opp1",
            name: "Jane Doe - DEAL NAME",
            pipelineId: "pipe1",
            pipelineStageId: options.stage ?? "stNew",
            status: options.status ?? "open",
            monetaryValue: 1200,
            source: "Facebook",
            contactId: "cont1",
            contact: { id: "cont1", name: "Jane Doe", email: "jane@example.com", phone: "+15550001111", tags: ["hot"] },
            lastStageChangeAt: new Date(now - DAY).toISOString(),
            lastStatusChangeAt: new Date(now - DAY).toISOString(),
            updatedAt: new Date(now - DAY).toISOString(),
          },
          { id: "opp2", name: "Won deal", pipelineId: "pipe1", pipelineStageId: "stWon", status: "won", monetaryValue: 4800, source: "Google Ads", contactId: "cont2", lastStatusChangeAt: new Date(now - 3 * DAY).toISOString() },
        ],
        meta: { total: 2 },
      });
    }
    if (p === "/contacts/search") {
      return json({
        contacts: [
          { id: "cont1", firstName: "Jane", lastName: "Doe", email: "jane@example.com", phone: "+15550001111", source: "Facebook", dateAdded: new Date(now - 2 * DAY).toISOString(), address1: "1 SECRET STREET", dateOfBirth: "1980-02-02" },
          { id: "cont2", firstName: "Omar", lastName: "Ali", email: "omar@example.com", source: "Google Ads", dateAdded: new Date(now - 5 * DAY).toISOString() },
        ],
        total: 2,
      });
    }
    if (p === "/conversations/search") return json({ conversations: [{ id: "conv1", contactId: "cont1", lastMessageBody: "SECRET LAST MESSAGE" }], total: 1 });
    if (p === "/conversations/conv1/messages") {
      return json({
        messages: {
          lastMessageId: "m2",
          nextPage: false,
          messages: [
            { id: "m1", messageType: "TYPE_SMS", direction: "inbound", dateAdded: new Date(now - DAY).toISOString(), contactId: "cont1", body: "SECRET MESSAGE BODY" },
            { id: "m2", messageType: "TYPE_CALL", direction: "outbound", dateAdded: new Date(now - DAY).toISOString(), contactId: "cont1", meta: { call: { duration: 120, status: "completed" } }, attachments: ["https://x/SECRET-RECORDING.mp3"] },
          ],
        },
      });
    }
    if (p === "/calendars/") return json({ calendars: [{ id: "cal1", name: "Sales calls" }] });
    if (p === "/calendars/events") return json({ events: [{ id: "ev1", startTime: new Date(now + DAY).toISOString(), appointmentStatus: "confirmed", contactId: "cont2", notes: "SECRET NOTE", title: "Call with Omar" }] });
    // A fresh read of one lead, made just before a message is sent.
    if (method === "GET" && /^\/contacts\/cont\d$/.test(p)) {
      return json({
        contact: {
          id: p.split("/")[2],
          phone: "+15550001111",
          email: "jane@example.com",
          timezone: options.leadTimezone === undefined ? "America/Chicago" : options.leadTimezone,
          dnd: options.dnd ?? false,
          dndSettings: { SMS: { status: options.smsDnd ?? "inactive" }, Email: { status: "inactive" } },
        },
      });
    }
    // Writes: only reached after a person approved an action.
    if (options.failWrites && method !== "GET" && p !== "/oauth/token" && p !== "/contacts/search") return json({ message: "refused" }, options.failWrites);
    if (method === "POST" && p === "/conversations/messages") return json({ conversationId: "conv1", messageId: "msg9" });
    if (method === "PUT" && /^\/opportunities\/opp\d$/.test(p)) return json({ opportunity: { id: p.split("/")[2] } });
    if (method === "PUT" && /^\/opportunities\/opp\d\/status$/.test(p)) return json({ succeded: true });
    if ((method === "POST" || method === "DELETE") && /^\/contacts\/cont\d\/tags$/.test(p)) return json({ tags: [] });
    if (method === "POST" && /^\/contacts\/cont\d\/notes$/.test(p)) return json({ note: { id: "note1" } });
    if (method === "POST" && /^\/contacts\/cont\d\/tasks$/.test(p)) return json({ task: { id: "task1" } });
    return json({ message: "not found" }, 404);
  });
  return { fake, calls };
}

beforeEach(() => {
  for (const name of ENV) delete process.env[name];
  process.env.HIGHLEVEL_CLIENT_ID = "hl-client";
  process.env.HIGHLEVEL_CLIENT_SECRET = "HL-APP-SECRET";
  process.env.HIGHLEVEL_CALL_GAP_MS = "0";
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});
afterEach(() => {
  for (const name of ENV) delete process.env[name];
  vi.unstubAllGlobals();
  vi.clearAllTimers();
  vi.useRealTimers();
});

async function setup() {
  const t = convexTest(schema, modules);
  const workspaceId = await t.mutation(internal.reviewer.setUpReviewerWorkspace, { userId: "user_owner" });
  const ids = await t.run(async (ctx) => {
    await ctx.db.insert("members", { workspaceId, userId: "user_admin", role: "admin", displayName: "Admin", active: true });
    const member = await ctx.db.insert("members", { workspaceId, userId: "user_member", role: "member", displayName: "Member", active: true });
    await ctx.db.insert("members", { workspaceId, userId: "user_viewer", role: "viewer", displayName: "Viewer", active: true });
    const client = { workspaceId, type: "business" as const, status: "active" as const, createdBy: "user_owner", createdAt: 0, updatedAt: 0 };
    const acme = await ctx.db.insert("clients", { ...client, name: "Acme", normalizedName: "acme" });
    const beta = await ctx.db.insert("clients", { ...client, name: "Beta", normalizedName: "beta" });
    // The member may see Beta only.
    await ctx.db.insert("clientAssignments", { workspaceId, clientId: beta, memberId: member, assignedBy: "user_owner", assignedAt: 0 });
    const other = await ctx.db.insert("workspaces", { name: "Other", slug: "other", timezone: "UTC", status: "active", createdAt: 0 });
    await ctx.db.insert("members", { workspaceId: other, userId: "user_other", role: "owner", displayName: "Other", active: true });
    return { acme, beta };
  });
  const as = (subject: string) => t.withIdentity({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });
  return { t, workspaceId, ...ids, owner: as("user_owner"), admin: as("user_admin"), member: as("user_member"), viewer: as("user_viewer"), stranger: as("user_other") };
}

type Setup = Awaited<ReturnType<typeof setup>>;

/** Starts an install as the Owner and comes back through the callback, as HighLevel would send the browser. */
async function connectThroughCallback(s: Setup, clientId?: Id<"clients">) {
  const { url } = await s.owner.mutation(api.highLevel.startConnect, { workspaceId: s.workspaceId, clientId, returnOrigin: "https://app.vistrial.io" });
  const state = new URL(url).searchParams.get("state")!;
  const response = await s.t.fetch(`/crm/hl/callback?code=the-code&state=${state}`, { method: "GET" });
  return { response, location: response.headers.get("location") ?? "", state, url };
}

async function settle(t: Setup["t"]) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function allCrmRows(t: Setup["t"]) {
  return t.run(async (ctx) => ({
    connections: await ctx.db.query("crmConnections").collect(),
    pipelines: await ctx.db.query("crmPipelines").collect(),
    deals: await ctx.db.query("crmDeals").collect(),
    contacts: await ctx.db.query("crmContacts").collect(),
    activities: await ctx.db.query("crmActivities").collect(),
    summaries: await ctx.db.query("crmSummaries").collect(),
    runs: await ctx.db.query("crmSyncRuns").collect(),
    days: await ctx.db.query("crmCallDays").collect(),
  }));
}

describe("HighLevel connection", () => {
  it("lets only an Owner start an install, with read scopes and a one-use state", async () => {
    const s = await setup();
    await expect(s.admin.mutation(api.highLevel.startConnect, { workspaceId: s.workspaceId })).rejects.toThrow();
    await expect(s.member.mutation(api.highLevel.startConnect, { workspaceId: s.workspaceId })).rejects.toThrow();
    await expect(s.stranger.mutation(api.highLevel.startConnect, { workspaceId: s.workspaceId })).rejects.toThrow();
    const { url } = await s.owner.mutation(api.highLevel.startConnect, { workspaceId: s.workspaceId, clientId: s.acme, returnOrigin: "https://evil.example.com" });
    const params = new URL(url).searchParams;
    expect(params.get("redirect_uri")).toBe("https://example.convex.site/crm/hl/callback");
    expect(params.get("scope")!.split(" ")).toEqual([...HL_SCOPES]);
    const nonce = params.get("state")!;
    expect(await s.t.mutation(internal.highLevel.consumeState, { nonce })).toMatchObject({ workspaceId: s.workspaceId, clientId: s.acme, returnOrigin: null });
    expect(await s.t.mutation(internal.highLevel.consumeState, { nonce })).toBeNull();
  });

  it("refuses an install whose Owner stopped being an Owner before it came back", async () => {
    const s = await setup();
    const { url } = await s.owner.mutation(api.highLevel.startConnect, { workspaceId: s.workspaceId });
    await s.t.run(async (ctx) => {
      const row = await ctx.db.query("members").withIndex("by_workspace_user", (q) => q.eq("workspaceId", s.workspaceId).eq("userId", "user_owner")).unique();
      await ctx.db.patch(row!._id, { role: "admin" });
    });
    expect(await s.t.mutation(internal.highLevel.consumeState, { nonce: new URL(url).searchParams.get("state")! })).toBeNull();
  });

  it("connects a client's sub-account, reads it, and never returns a token", async () => {
    const s = await setup();
    const hl = fakeHighLevel();
    vi.stubGlobal("fetch", hl.fake);
    const { location } = await connectThroughCallback(s, s.acme);
    expect(location).toBe("https://app.vistrial.io/app/connections/highlevel?highlevel=connected");
    await settle(s.t);

    const status = await s.owner.query(api.highLevel.status, { workspaceId: s.workspaceId, clientId: s.acme });
    expect(JSON.stringify(status)).not.toMatch(/ACCESS-TOKEN|REFRESH-TOKEN|HL-APP-SECRET/);
    expect(status.connection).toMatchObject({ accountName: "Northlight Cleaning", status: "connected", lastSyncCode: "ok" });
    expect(status.summary).toMatchObject({ open: { count: 1, value: 1200 }, won: { d30: { count: 1, value: 4800 } }, counts: { deals: 2, contacts: 2 } });
    expect(status.summary?.activity30).toMatchObject({ calls: 1, messages: 1, appointments: 0, inbound: 1, outbound: 1 });
    expect(status.summary?.upcoming).toBe(1);
    expect(status.runs[0]).toMatchObject({ trigger: "connect", status: "done" });
    expect(status.runs[0].steps.map((step: { key: string }) => step.key)).toEqual(["access", "pipelines", "deals", "contacts", "activity", "appointments", "save"]);
    expect(status.usage?.ok).toBeGreaterThan(5);

    const rows = await allCrmRows(s.t);
    expect(rows.connections[0]).toMatchObject({ clientId: s.acme, accountId: LOCATION, refreshToken: "REFRESH-TOKEN-1" });
    expect(rows.contacts.find((row) => row.externalId === "cont1")).toMatchObject({ name: "Jane Doe", email: "jane@example.com", phone: "+15550001111", clientId: s.acme });
    expect(rows.activities.map((row) => row.kind).sort()).toEqual(["appointment", "call", "sms"]);
    expect(rows.deals.every((row) => row.clientId === s.acme)).toBe(true);

    // Minimised: no message text, deal name, recording, notes, address or date of birth is kept anywhere.
    const kept = JSON.stringify({ ...rows, connections: [] });
    for (const secret of ["SECRET", "DEAL NAME", "1980-02-02", "Call with Omar"]) expect(kept).not.toContain(secret);
  });

  it("only ever reads: GET requests, plus the contact search and the token endpoint", async () => {
    const s = await setup();
    const hl = fakeHighLevel();
    vi.stubGlobal("fetch", hl.fake);
    await connectThroughCallback(s);
    await settle(s.t);
    await s.admin.action(api.highLevel.syncNow, { workspaceId: s.workspaceId });
    const writes = hl.calls.filter((call) => call.method !== "GET");
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every((call) => call.path === "/oauth/token" || call.path === "/contacts/search")).toBe(true);
    expect(hl.calls.every((call) => call.path === "/oauth/token" || call.auth === "Bearer ACCESS-TOKEN-1")).toBe(true);
  });

  it("refuses an agency-level install and one without every read permission", async () => {
    const s = await setup();
    vi.stubGlobal("fetch", fakeHighLevel({ userType: "Company" }).fake);
    expect((await connectThroughCallback(s)).location).toContain("highlevel=agency_install");
    vi.stubGlobal("fetch", fakeHighLevel({ scope: "contacts.readonly opportunities.readonly" }).fake);
    expect((await connectThroughCallback(s)).location).toContain("highlevel=missing_permission");
    expect((await allCrmRows(s.t)).connections).toHaveLength(0);
  });

  it("does not let one sub-account be connected to two clients", async () => {
    const s = await setup();
    vi.stubGlobal("fetch", fakeHighLevel().fake);
    await connectThroughCallback(s, s.acme);
    await settle(s.t);
    expect((await connectThroughCallback(s, s.beta)).location).toContain("highlevel=already_connected");
    expect((await allCrmRows(s.t)).connections).toHaveLength(1);
  });

  it("refuses a callback with an unknown or reused state", async () => {
    const s = await setup();
    vi.stubGlobal("fetch", fakeHighLevel().fake);
    const bad = await s.t.fetch(`/crm/hl/callback?code=x&state=${"a".repeat(48)}`, { method: "GET" });
    expect(bad.headers.get("location")).toContain("highlevel=expired");
    const { state } = await connectThroughCallback(s);
    const again = await s.t.fetch(`/crm/hl/callback?code=x&state=${state}`, { method: "GET" });
    expect(again.headers.get("location")).toContain("highlevel=expired");
  });

  it("keeps a client's CRM data from a member who may not see that client", async () => {
    const s = await setup();
    vi.stubGlobal("fetch", fakeHighLevel().fake);
    await connectThroughCallback(s, s.acme);
    await settle(s.t);
    await expect(s.member.query(api.highLevel.status, { workspaceId: s.workspaceId, clientId: s.acme })).rejects.toThrow();
    expect((await s.member.query(api.highLevel.overview, { workspaceId: s.workspaceId })).connections).toHaveLength(0);
    await expect(s.stranger.query(api.highLevel.status, { workspaceId: s.workspaceId, clientId: s.acme })).rejects.toThrow();
    // An Admin sees it, but not the Owner's record of what Vistrial did.
    const adminView = await s.admin.query(api.highLevel.status, { workspaceId: s.workspaceId, clientId: s.acme });
    expect(adminView.connection?.accountName).toBe("Northlight Cleaning");
    expect(adminView.runs).toHaveLength(0);
    expect(adminView.usage).toBeNull();
  });

  it("lets Owners and Admins read again, not Members or Viewers", async () => {
    const s = await setup();
    vi.stubGlobal("fetch", fakeHighLevel().fake);
    await connectThroughCallback(s);
    await settle(s.t);
    await expect(s.viewer.action(api.highLevel.syncNow, { workspaceId: s.workspaceId })).rejects.toThrow();
    await expect(s.member.action(api.highLevel.syncNow, { workspaceId: s.workspaceId })).rejects.toThrow();
    expect(await s.admin.action(api.highLevel.syncNow, { workspaceId: s.workspaceId })).toEqual({ code: "ok" });
  });

  it("records a stage change and a won deal found between reads", async () => {
    const s = await setup();
    vi.stubGlobal("fetch", fakeHighLevel().fake);
    await connectThroughCallback(s);
    await settle(s.t);
    vi.stubGlobal("fetch", fakeHighLevel({ stage: "stWon", status: "won" }).fake);
    await s.owner.action(api.highLevel.syncNow, { workspaceId: s.workspaceId });
    const moves = (await allCrmRows(s.t)).activities.filter((row) => row.kind === "stage_change" || row.kind === "status_change");
    expect(moves.find((row) => row.kind === "stage_change")).toMatchObject({ fromStage: "stNew", toStage: "stWon", dealId: "opp1" });
    expect(moves.find((row) => row.kind === "status_change")).toMatchObject({ status: "won" });
    const status = await s.owner.query(api.highLevel.status, { workspaceId: s.workspaceId });
    expect(status.summary?.activity30.stageChanges).toBe(1);
    expect(status.summary?.won.d30).toEqual({ count: 2, value: 6000 });
  });

  it("renews an ending token once, keeping the new one-use renewal token", async () => {
    const s = await setup();
    const hl = fakeHighLevel();
    vi.stubGlobal("fetch", hl.fake);
    await connectThroughCallback(s);
    await settle(s.t);
    await s.t.run(async (ctx) => {
      const row = (await ctx.db.query("crmConnections").first())!;
      await ctx.db.patch(row._id, { tokenExpiresAt: Date.now() + 60_000 });
    });
    await s.owner.action(api.highLevel.syncNow, { workspaceId: s.workspaceId });
    const refreshes = hl.calls.filter((call) => call.path === "/oauth/token" && call.body?.includes("grant_type=refresh_token"));
    expect(refreshes).toHaveLength(1);
    expect(refreshes[0].body).toContain("refresh_token=REFRESH-TOKEN-1");
    const [row] = (await allCrmRows(s.t)).connections;
    expect(row).toMatchObject({ accessToken: "ACCESS-TOKEN-2", refreshToken: "REFRESH-TOKEN-2", status: "connected" });
    expect(row.refreshingSince).toBeUndefined();
  });

  it("asks for a reconnect when HighLevel refuses the renewal", async () => {
    const s = await setup();
    vi.stubGlobal("fetch", fakeHighLevel({ refresh: "invalid_grant" }).fake);
    await connectThroughCallback(s);
    await settle(s.t);
    await s.t.run(async (ctx) => {
      const row = (await ctx.db.query("crmConnections").first())!;
      await ctx.db.patch(row._id, { tokenExpiresAt: Date.now() - 1000 });
    });
    expect(await s.owner.action(api.highLevel.syncNow, { workspaceId: s.workspaceId })).toEqual({ code: "token_rejected" });
    const status = await s.owner.query(api.highLevel.status, { workspaceId: s.workspaceId });
    expect(status.connection?.status).toBe("needsReconnect");
  });

  it("stops a read at HighLevel's rate limit without retrying around it", async () => {
    const s = await setup();
    const hl = fakeHighLevel({ rateLimitAt: "/contacts/search" });
    vi.stubGlobal("fetch", hl.fake);
    await connectThroughCallback(s);
    await settle(s.t);
    const status = await s.owner.query(api.highLevel.status, { workspaceId: s.workspaceId });
    expect(status.connection?.lastSyncCode).toBe("rate_limited");
    expect(status.runs[0]).toMatchObject({ status: "failed", code: "rate_limited" });
    expect(hl.calls.filter((call) => call.path === "/contacts/search")).toHaveLength(1);
    expect(hl.calls.some((call) => call.path.startsWith("/conversations"))).toBe(false);
    expect(status.connection?.status).toBe("connected");
  });

  it("disconnect removes the tokens and everything read, and only an Owner may do it", async () => {
    const s = await setup();
    vi.stubGlobal("fetch", fakeHighLevel().fake);
    await connectThroughCallback(s, s.acme);
    await settle(s.t);
    await expect(s.admin.mutation(api.highLevel.disconnect, { workspaceId: s.workspaceId, clientId: s.acme })).rejects.toThrow();
    await s.owner.mutation(api.highLevel.disconnect, { workspaceId: s.workspaceId, clientId: s.acme });
    expect((await s.owner.query(api.highLevel.status, { workspaceId: s.workspaceId, clientId: s.acme })).connection).toBeNull();
    await settle(s.t);
    const rows = await allCrmRows(s.t);
    for (const [table, list] of Object.entries(rows)) expect(list, table).toHaveLength(0);
  });

  it("removes a sub-account's connections when the app is uninstalled in HighLevel, but not on a replay", async () => {
    const s = await setup();
    vi.stubGlobal("fetch", fakeHighLevel().fake);
    await connectThroughCallback(s);
    await settle(s.t);
    expect(await s.t.mutation(internal.highLevel.uninstalled, { locationId: LOCATION, at: Date.now() - 365 * DAY })).toEqual({ removed: 0 });
    expect(await s.t.mutation(internal.highLevel.uninstalled, { locationId: LOCATION, at: Date.now() + 1000 })).toEqual({ removed: 1 });
    await settle(s.t);
    expect((await allCrmRows(s.t)).contacts).toHaveLength(0);
  });

  it("refuses a webhook without HighLevel's signature", async () => {
    const s = await setup();
    vi.stubGlobal("fetch", fakeHighLevel().fake);
    await connectThroughCallback(s);
    await settle(s.t);
    const body = JSON.stringify({ type: "UNINSTALL", locationId: LOCATION });
    const unsigned = await s.t.fetch("/crm/hl/webhook", { method: "POST", body });
    expect(unsigned.status).toBe(401);
    const forged = await s.t.fetch("/crm/hl/webhook", { method: "POST", body, headers: { "x-ghl-signature": "bm90IGEgc2lnbmF0dXJl" } });
    expect(forged.status).toBe(401);
    expect((await allCrmRows(s.t)).connections).toHaveLength(1);
  });

  it("removes a connection signed out for 30 days, with its data", async () => {
    const s = await setup();
    vi.stubGlobal("fetch", fakeHighLevel().fake);
    await connectThroughCallback(s);
    await settle(s.t);
    await s.t.run(async (ctx) => {
      const row = (await ctx.db.query("crmConnections").first())!;
      await ctx.db.patch(row._id, { status: "needsReconnect", needsReconnectSince: Date.now() - 31 * DAY });
    });
    expect(await s.t.action(internal.highLevel.syncAll, {})).toEqual({ scheduled: 0, removed: 1 });
    await settle(s.t);
    const rows = await allCrmRows(s.t);
    expect(rows.connections).toHaveLength(0);
    expect(rows.deals).toHaveLength(0);
  });
});

describe("acting in HighLevel, with approval", () => {
  async function connected(clientId?: Id<"clients">) {
    const s = await setup();
    const hl = fakeHighLevel();
    vi.stubGlobal("fetch", hl.fake);
    await connectThroughCallback(s, clientId);
    await settle(s.t);
    return { ...s, hl, writes: () => hl.calls.filter((call) => call.method !== "GET" && call.path !== "/oauth/token" && call.path !== "/contacts/search") };
  }
  const move = { kind: "move_stage" as const, dealId: "opp1", stageId: "stBooked", why: "She booked an estimate on the phone." };

  it("does nothing until an Owner turns acting on, and only an Owner can", async () => {
    const s = await connected();
    await expect(s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, ...move })).rejects.toThrow(/not let Vistrial act/);
    await expect(s.admin.mutation(api.crmActions.setActing, { workspaceId: s.workspaceId, on: true })).rejects.toThrow();
    await s.owner.mutation(api.crmActions.setActing, { workspaceId: s.workspaceId, on: true });
    expect((await s.member.query(api.crmActions.list, { workspaceId: s.workspaceId })).enabled).toBe(true);
    expect(s.writes()).toHaveLength(0);
  });

  it("sends nothing on a proposal; an Admin's approval in the shared queue sends exactly one write", async () => {
    const s = await connected();
    await s.owner.mutation(api.crmActions.setActing, { workspaceId: s.workspaceId, on: true });
    await expect(s.viewer.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, ...move })).rejects.toThrow();
    const actionId = await s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, ...move });
    await settle(s.t);
    expect(s.writes()).toHaveLength(0);

    const queue = await s.admin.query(api.approvals.waiting, { workspaceId: s.workspaceId });
    const item = queue.items.find((row) => row.summary.includes("from New lead to Booked"))!;
    expect(item).toMatchObject({ kind: "accountChange", ownerOnly: false, canDecide: true });
    expect(item.summary).not.toContain("Jane");
    await expect(s.member.mutation(api.approvals.decide, { workspaceId: s.workspaceId, approvalId: item.id, approve: true })).rejects.toThrow();
    await s.admin.mutation(api.approvals.decide, { workspaceId: s.workspaceId, approvalId: item.id, approve: true });
    await settle(s.t);

    expect(s.writes()).toEqual([expect.objectContaining({ method: "PUT", path: "/opportunities/opp1", body: JSON.stringify({ pipelineId: "pipe1", pipelineStageId: "stBooked" }) })]);
    const rows = await s.t.run(async (ctx) => ({ action: await ctx.db.get(actionId), deal: await ctx.db.query("crmDeals").withIndex("by_connection").filter((q) => q.eq(q.field("externalId"), "opp1")).first(), approval: await ctx.db.get(item.id) }));
    expect(rows.action).toMatchObject({ state: "done", decidedBy: "user_admin", resultCode: "ok", before: { stageId: "stNew", pipelineId: "pipe1" } });
    expect(rows.deal?.stageId).toBe("stBooked");
    expect(rows.approval).toMatchObject({ status: "approved", decidedBy: "user_admin" });
  });

  it("makes changing a deal's outcome the Owner's alone, with the typed word", async () => {
    const s = await connected();
    await s.owner.mutation(api.crmActions.setActing, { workspaceId: s.workspaceId, on: true });
    const actionId = await s.admin.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, kind: "set_status", dealId: "opp1", status: "won", why: "Signed today." });
    await expect(s.admin.mutation(api.crmActions.decide, { workspaceId: s.workspaceId, actionId, approve: true, confirmWord: "VALUE" })).rejects.toThrow(/Only an Owner/);
    await expect(s.owner.mutation(api.crmActions.decide, { workspaceId: s.workspaceId, actionId, approve: true })).rejects.toThrow(/Type VALUE/);
    await s.owner.mutation(api.crmActions.decide, { workspaceId: s.workspaceId, actionId, approve: true, confirmWord: "VALUE" });
    await settle(s.t);
    expect(s.writes()).toEqual([expect.objectContaining({ method: "PUT", path: "/opportunities/opp1/status", body: JSON.stringify({ status: "won" }) })]);
  });

  it("undoes a stage move by proposing the reverse, which is approved like any other", async () => {
    const s = await connected();
    await s.owner.mutation(api.crmActions.setActing, { workspaceId: s.workspaceId, on: true });
    const first = await s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, ...move });
    await s.admin.mutation(api.crmActions.decide, { workspaceId: s.workspaceId, actionId: first, approve: true });
    await settle(s.t);
    const reverse = await s.member.mutation(api.crmActions.undo, { workspaceId: s.workspaceId, actionId: first });
    await settle(s.t);
    expect(s.writes()).toHaveLength(1);
    await s.owner.mutation(api.crmActions.decide, { workspaceId: s.workspaceId, actionId: reverse, approve: true });
    await settle(s.t);
    expect(s.writes()[1]).toMatchObject({ method: "PUT", path: "/opportunities/opp1", body: JSON.stringify({ pipelineId: "pipe1", pipelineStageId: "stNew" }) });
    const list = await s.owner.query(api.crmActions.list, { workspaceId: s.workspaceId });
    expect(list.actions.find((row) => row.id === first)).toMatchObject({ undone: true, canUndo: false });
    await expect(s.member.mutation(api.crmActions.undo, { workspaceId: s.workspaceId, actionId: first })).rejects.toThrow();
  });

  it("adds a tag, a note and a task with HighLevel's request shapes, and cannot undo a note", async () => {
    const s = await connected();
    await s.owner.mutation(api.crmActions.setActing, { workspaceId: s.workspaceId, on: true });
    const due = Date.now() + 2 * DAY;
    const ids = [
      await s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, kind: "add_tag", contactId: "cont1", tag: "estimate-booked", why: "Booked." }),
      await s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, kind: "add_note", contactId: "cont1", body: "Prefers mornings.", why: "From the call." }),
      await s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, kind: "create_task", contactId: "cont1", title: "Send the estimate", dueAt: due, why: "Promised by Friday." }),
    ];
    for (const actionId of ids) await s.admin.mutation(api.crmActions.decide, { workspaceId: s.workspaceId, actionId, approve: true });
    await settle(s.t);
    expect(s.writes().map((call) => [call.method, call.path, JSON.parse(call.body ?? "{}")])).toEqual([
      ["POST", "/contacts/cont1/tags", { tags: ["estimate-booked"] }],
      ["POST", "/contacts/cont1/notes", { body: "Prefers mornings." }],
      ["POST", "/contacts/cont1/tasks", { title: "Send the estimate", dueDate: new Date(due).toISOString(), completed: false }],
    ]);
    const list = await s.owner.query(api.crmActions.list, { workspaceId: s.workspaceId });
    expect(list.leads.find((row) => row.id === "cont1")?.tags).toContain("estimate-booked");
    expect(list.actions.find((row) => row.id === ids[1])).toMatchObject({ state: "done", canUndo: false });
    await expect(s.member.mutation(api.crmActions.undo, { workspaceId: s.workspaceId, actionId: ids[1] })).rejects.toThrow(/cannot undo/);
  });

  it("refuses a deal, lead or stage Vistrial has not read from this sub-account", async () => {
    const s = await connected();
    await s.owner.mutation(api.crmActions.setActing, { workspaceId: s.workspaceId, on: true });
    await expect(s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, ...move, dealId: "oppINVENTED" })).rejects.toThrow(/has not read that deal/);
    await expect(s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, ...move, stageId: "stElsewhere" })).rejects.toThrow(/not in this deal's pipeline/);
    await expect(s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, kind: "add_note", contactId: "contX", body: "x", why: "x" })).rejects.toThrow(/has not read that lead/);
    expect(s.writes()).toHaveLength(0);
  });

  it("sends nothing when declined, expired, or when acting is switched off after approval", async () => {
    const s = await connected();
    await s.owner.mutation(api.crmActions.setActing, { workspaceId: s.workspaceId, on: true });
    const declined = await s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, ...move });
    await s.admin.mutation(api.crmActions.decide, { workspaceId: s.workspaceId, actionId: declined, approve: false });
    const old = await s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, kind: "add_tag", contactId: "cont2", tag: "cold", why: "No answer." });
    await s.t.run(async (ctx) => ctx.db.patch(old, { proposedAt: Date.now() - 25 * 3_600_000 }));
    expect(await s.admin.mutation(api.crmActions.decide, { workspaceId: s.workspaceId, actionId: old, approve: true })).toEqual({ state: "expired" });
    // Approved, then acting switched off before it ran: it is cancelled, not sent.
    const raced = await s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, ...move });
    await s.admin.mutation(api.crmActions.decide, { workspaceId: s.workspaceId, actionId: raced, approve: true });
    const waiting = await s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, kind: "add_tag", contactId: "cont1", tag: "vip", why: "Big job." });
    await s.owner.mutation(api.crmActions.setActing, { workspaceId: s.workspaceId, on: false });
    await settle(s.t);
    expect(s.writes()).toHaveLength(0);
    const states = await s.t.run(async (ctx) => Promise.all([declined, old, raced, waiting].map(async (id) => (await ctx.db.get(id))?.state)));
    expect(states).toEqual(["declined", "expired", "cancelled", "cancelled"]);
    expect((await s.admin.query(api.approvals.waiting, { workspaceId: s.workspaceId })).items.filter((row) => row.summary.startsWith("HighLevel"))).toHaveLength(0);
  });

  it("keeps a client's actions from a member who may not see that client", async () => {
    const s = await setup();
    vi.stubGlobal("fetch", fakeHighLevel().fake);
    await connectThroughCallback(s, s.acme);
    await settle(s.t);
    await s.owner.mutation(api.crmActions.setActing, { workspaceId: s.workspaceId, clientId: s.acme, on: true });
    // The member is assigned Beta only.
    await expect(s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, clientId: s.acme, ...move })).rejects.toThrow();
    await s.admin.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, clientId: s.acme, ...move });
    expect((await s.member.query(api.crmActions.list, { workspaceId: s.workspaceId, clientId: s.acme })).actions).toHaveLength(0);
    expect((await s.member.query(api.approvals.waiting, { workspaceId: s.workspaceId })).items).toHaveLength(0);
    expect((await s.admin.query(api.crmActions.list, { workspaceId: s.workspaceId, clientId: s.acme })).actions).toHaveLength(1);
  });

  it("closes waiting approvals and deletes actions on disconnect", async () => {
    const s = await connected();
    await s.owner.mutation(api.crmActions.setActing, { workspaceId: s.workspaceId, on: true });
    await s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, ...move });
    await s.owner.mutation(api.highLevel.disconnect, { workspaceId: s.workspaceId });
    await settle(s.t);
    expect((await s.admin.query(api.approvals.waiting, { workspaceId: s.workspaceId })).items.filter((row) => row.summary.startsWith("HighLevel"))).toHaveLength(0);
    expect(await s.t.run((ctx) => ctx.db.query("crmActions").collect())).toHaveLength(0);
    expect(s.writes()).toHaveLength(0);
  });
});

/** An IANA zone where it is now `hour` o'clock: Etc/GMT zones cover every offset from -12 to +14 hours. */
function zoneAt(hour: number) {
  const utc = new Date().getUTCHours();
  let offset = (((hour - utc) % 24) + 24) % 24;
  if (offset > 14) offset -= 24;
  return offset === 0 ? "Etc/GMT" : offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}

describe("messaging leads, behind its own switch", () => {
  async function ready(options: Parameters<typeof fakeHighLevel>[0] = {}) {
    const s = await setup();
    const hl = fakeHighLevel({ leadTimezone: zoneAt(12), ...options });
    vi.stubGlobal("fetch", hl.fake);
    await connectThroughCallback(s);
    await settle(s.t);
    await s.owner.mutation(api.crmActions.setActing, { workspaceId: s.workspaceId, on: true });
    const sends = () => hl.calls.filter((call) => call.path === "/conversations/messages");
    return { ...s, hl, sends };
  }
  const text = { kind: "send_sms" as const, contactId: "cont1", body: "Hi Jane, your estimate is ready. Reply STOP to opt out.", why: "She asked for it by text." };

  async function sendApproved(s: Awaited<ReturnType<typeof ready>>, input: Parameters<typeof s.member.mutation<typeof api.crmActions.propose>>[1] = { workspaceId: s.workspaceId, ...text }) {
    const actionId = await s.member.mutation(api.crmActions.propose, input);
    await s.owner.mutation(api.crmActions.decide, { workspaceId: s.workspaceId, actionId, approve: true, confirmWord: "SEND" });
    await settle(s.t);
    return { actionId, action: await s.t.run((ctx) => ctx.db.get(actionId)) };
  }

  it("is off by default; only an Owner turns it on, after acting, confirming consent", async () => {
    const s = await ready();
    await expect(s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, ...text })).rejects.toThrow(/Messaging leads is off/);
    await expect(s.admin.mutation(api.crmActions.setMessaging, { workspaceId: s.workspaceId, on: true, consentConfirmed: true })).rejects.toThrow();
    await expect(s.owner.mutation(api.crmActions.setMessaging, { workspaceId: s.workspaceId, on: true })).rejects.toThrow(/consent/);
    await s.owner.mutation(api.crmActions.setMessaging, { workspaceId: s.workspaceId, on: true, consentConfirmed: true });
    const list = await s.owner.query(api.crmActions.list, { workspaceId: s.workspaceId });
    expect(list.messaging.enabled).toBe(true);
    expect(list.messaging.consentAt).toBeTypeOf("number");
    expect(s.sends()).toHaveLength(0);
  });

  it("sends a text only on the Owner's typed SEND, after checking opt-out and local time, and records the checks", async () => {
    const s = await ready();
    await s.owner.mutation(api.crmActions.setMessaging, { workspaceId: s.workspaceId, on: true, consentConfirmed: true });
    const actionId = await s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, ...text });
    await expect(s.admin.mutation(api.crmActions.decide, { workspaceId: s.workspaceId, actionId, approve: true, confirmWord: "SEND" })).rejects.toThrow(/Only an Owner/);
    await expect(s.owner.mutation(api.crmActions.decide, { workspaceId: s.workspaceId, actionId, approve: true, confirmWord: "VALUE" })).rejects.toThrow(/Type SEND/);
    await s.owner.mutation(api.crmActions.decide, { workspaceId: s.workspaceId, actionId, approve: true, confirmWord: "SEND" });
    await settle(s.t);
    expect(s.sends()).toEqual([expect.objectContaining({ method: "POST", body: JSON.stringify({ type: "SMS", contactId: "cont1", message: text.body }) })]);
    // The fresh read came before the send.
    const order = s.hl.calls.map((call) => `${call.method} ${call.path}`);
    expect(order.indexOf("GET /contacts/cont1")).toBeLessThan(order.indexOf("POST /conversations/messages"));
    const action = await s.t.run((ctx) => ctx.db.get(actionId));
    expect(action).toMatchObject({ state: "done", checks: { dnd: false, localHour: 12, result: "passed" } });
    expect(action?.checks?.consent).toMatch(/^Owner confirmed consent on \d{4}-\d{2}-\d{2}$/);
  });

  it("refuses a lead on Do Not Disturb, and says so in the Briefing", async () => {
    const s = await ready({ smsDnd: "active" });
    await s.owner.mutation(api.crmActions.setMessaging, { workspaceId: s.workspaceId, on: true, consentConfirmed: true });
    const { action } = await sendApproved(s);
    expect(s.sends()).toHaveLength(0);
    expect(action).toMatchObject({ state: "failed", resultCode: "opted_out", checks: { dnd: true, result: "opted_out" } });
    const alerts = await s.t.run((ctx) => ctx.db.query("briefingItems").filter((q) => q.eq(q.field("kind"), "alert")).collect());
    expect(alerts.find((row) => row.refId === action?._id)?.body).toMatch(/Do Not Disturb.*not retried/);
  });

  it("refuses during quiet hours in the lead's own time, and when their time is unknown", async () => {
    const night = await ready({ leadTimezone: zoneAt(23) });
    await night.owner.mutation(api.crmActions.setMessaging, { workspaceId: night.workspaceId, on: true, consentConfirmed: true });
    expect((await sendApproved(night)).action).toMatchObject({ state: "failed", resultCode: "quiet_hours" });
    expect(night.sends()).toHaveLength(0);

    const early = await ready({ leadTimezone: zoneAt(7) });
    await early.owner.mutation(api.crmActions.setMessaging, { workspaceId: early.workspaceId, on: true, consentConfirmed: true });
    expect((await sendApproved(early)).action).toMatchObject({ state: "failed", resultCode: "quiet_hours" });

    const unknown = await ready({ leadTimezone: null });
    await unknown.owner.mutation(api.crmActions.setMessaging, { workspaceId: unknown.workspaceId, on: true, consentConfirmed: true });
    await unknown.t.run(async (ctx) => {
      const row = (await ctx.db.query("crmConnections").first())!;
      await ctx.db.patch(row._id, { timezone: undefined });
    });
    expect((await sendApproved(unknown)).action).toMatchObject({ state: "failed", resultCode: "no_timezone" });
    expect(unknown.sends()).toHaveLength(0);
  });

  it("sends at most one message to a lead a day", async () => {
    const s = await ready();
    await s.owner.mutation(api.crmActions.setMessaging, { workspaceId: s.workspaceId, on: true, consentConfirmed: true });
    await sendApproved(s);
    const second = await sendApproved(s, { workspaceId: s.workspaceId, ...text, body: "Just checking in." });
    expect(second.action).toMatchObject({ state: "failed", resultCode: "too_soon" });
    expect(s.sends()).toHaveLength(1);
  });

  it("emails with a subject and escaped HTML", async () => {
    const s = await ready();
    await s.owner.mutation(api.crmActions.setMessaging, { workspaceId: s.workspaceId, on: true, consentConfirmed: true });
    await sendApproved(s, { workspaceId: s.workspaceId, kind: "send_email", contactId: "cont1", title: "Your estimate", body: "Hi <Jane>,\n\nAttached.", why: "Asked by email." });
    expect(JSON.parse(s.sends()[0].body!)).toEqual({ type: "Email", contactId: "cont1", subject: "Your estimate", message: "Hi <Jane>,\n\nAttached.", html: "<p>Hi &lt;Jane&gt;,</p><p>Attached.</p>" });
  });

  it("turning messaging off closes open messages but leaves other actions", async () => {
    const s = await ready();
    await s.owner.mutation(api.crmActions.setMessaging, { workspaceId: s.workspaceId, on: true, consentConfirmed: true });
    const message = await s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, ...text });
    const tag = await s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, kind: "add_tag", contactId: "cont1", tag: "warm", why: "Replied." });
    await s.owner.mutation(api.crmActions.setMessaging, { workspaceId: s.workspaceId, on: false });
    const states = await s.t.run(async (ctx) => [(await ctx.db.get(message))?.state, (await ctx.db.get(tag))?.state]);
    expect(states).toEqual(["cancelled", "proposed"]);
  });
});

describe("the organization's off switch and failures", () => {
  it("lets only an Owner stop every CRM action at once", async () => {
    const s = await setup();
    const hl = fakeHighLevel();
    vi.stubGlobal("fetch", hl.fake);
    await connectThroughCallback(s);
    await settle(s.t);
    await s.owner.mutation(api.crmActions.setActing, { workspaceId: s.workspaceId, on: true });
    const waiting = await s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, kind: "add_tag", contactId: "cont1", tag: "warm", why: "Replied." });
    await expect(s.admin.mutation(api.crmActions.setOrganizationActing, { workspaceId: s.workspaceId, on: false })).rejects.toThrow();
    await s.owner.mutation(api.crmActions.setOrganizationActing, { workspaceId: s.workspaceId, on: false });
    expect(await s.t.run(async (ctx) => (await ctx.db.get(waiting))?.state)).toBe("cancelled");
    await expect(s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, kind: "add_tag", contactId: "cont1", tag: "hot", why: "x" })).rejects.toThrow(/stopped every CRM action/);
    expect((await s.member.query(api.crmActions.list, { workspaceId: s.workspaceId })).organizationOff).toBe(true);
    await s.owner.mutation(api.crmActions.setOrganizationActing, { workspaceId: s.workspaceId, on: true });
    await s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, kind: "add_tag", contactId: "cont1", tag: "hot", why: "x" });
  });

  it("reports a refused write in the Briefing once and does not retry it", async () => {
    const s = await setup();
    const hl = fakeHighLevel({ failWrites: 422 });
    vi.stubGlobal("fetch", hl.fake);
    await connectThroughCallback(s);
    await settle(s.t);
    await s.owner.mutation(api.crmActions.setActing, { workspaceId: s.workspaceId, on: true });
    const actionId = await s.member.mutation(api.crmActions.propose, { workspaceId: s.workspaceId, kind: "add_tag", contactId: "cont1", tag: "warm", why: "Replied." });
    await s.admin.mutation(api.crmActions.decide, { workspaceId: s.workspaceId, actionId, approve: true });
    await settle(s.t);
    expect(hl.calls.filter((call) => call.path === "/contacts/cont1/tags")).toHaveLength(1);
    expect(await s.t.run(async (ctx) => (await ctx.db.get(actionId))?.state)).toBe("failed");
    const alerts = await s.t.run((ctx) => ctx.db.query("briefingItems").filter((q) => q.eq(q.field("refId"), actionId)).collect());
    expect(alerts.filter((row) => row.kind === "alert")).toHaveLength(1);
    expect(alerts.find((row) => row.kind === "alert")?.body).toMatch(/did not accept the change. It was not retried/);
  });
});
