/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { codeChallenge } from "./lib/integrations/oauth";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const ENV = [
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "CALENDLY_CLIENT_ID",
  "CALENDLY_CLIENT_SECRET",
  "CALENDLY_WEBHOOK_SIGNING_KEY",
  "INTEGRATIONS_CALLBACK_ORIGIN",
  "CONVEX_SITE_URL",
];

function setGoogle() {
  process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "GOOGLE-APP-SECRET";
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
}
function setCalendly() {
  process.env.CALENDLY_CLIENT_ID = "calendly-client";
  process.env.CALENDLY_CLIENT_SECRET = "CALENDLY-APP-SECRET";
  process.env.CALENDLY_WEBHOOK_SIGNING_KEY = "calendly-signing-key";
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
}

beforeEach(() => {
  for (const name of ENV) delete process.env[name];
  // A calendar is read once after it connects, as a scheduled step. Held here so it cannot run into the next test.
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
  const otherWorkspace = await t.run(async (ctx) => {
    await ctx.db.insert("members", { workspaceId, userId: "user_viewer", role: "viewer", displayName: "Viewer", active: true });
    await ctx.db.insert("members", { workspaceId, userId: "user_admin", role: "admin", displayName: "Admin", active: true });
    await ctx.db.insert("members", { workspaceId, userId: "user_member", role: "member", displayName: "Member", active: true });
    const other = await ctx.db.insert("workspaces", { name: "Other agency", slug: "other", timezone: "UTC", status: "active", createdAt: 0 });
    await ctx.db.insert("members", { workspaceId: other, userId: "user_other", role: "owner", displayName: "Other", active: true });
    return other;
  });
  const as = (subject: string) => t.withIdentity({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });
  return { t, workspaceId, otherWorkspace, owner: as("user_owner"), admin: as("user_admin"), member: as("user_member"), viewer: as("user_viewer"), stranger: as("user_other") };
}

async function connect(t: ReturnType<typeof convexTest>, workspaceId: Id<"workspaces">, provider = "google_calendar", extra: Record<string, unknown> = {}) {
  await t.mutation(internal.integrations.saveConnection, {
    workspaceId,
    provider,
    accessToken: "SECRET-ACCESS",
    refreshToken: "SECRET-REFRESH",
    tokenExpiresAt: Date.now() + 3_600_000,
    scopes: ["openid"],
    accountId: "acct-1",
    accountLabel: "owner@northpeak.agency",
    connectedBy: "user_owner",
    ...extra,
  });
}

const idToken = (claims: Record<string, unknown>) => `h.${btoa(JSON.stringify(claims)).replace(/=+$/, "")}.s`;

type Call = { url: string; method: string; headers: Record<string, string>; body: string };
/** A fake provider: answers by address, and remembers what it was sent. */
function fakeProvider(answers: Record<string, (call: Call) => { status?: number; json?: unknown }>) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (input: string | URL, init?: { method?: string; headers?: Record<string, string>; body?: unknown }) => {
    const call = { url: String(input), method: init?.method ?? "GET", headers: init?.headers ?? {}, body: init?.body ? String(init.body) : "" };
    calls.push(call);
    const answer = Object.entries(answers).find(([prefix]) => call.url.startsWith(prefix))?.[1];
    if (!answer) throw new Error(`unexpected call to ${call.url}`);
    const { status = 200, json = {} } = answer(call);
    return new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } });
  });
  return calls;
}

describe("connections: what screens read", () => {
  it("shows every provider as not set up while the deployment has no settings, in three groups", async () => {
    const { workspaceId, viewer } = await setup();
    const result = await viewer.query(api.integrations.list, { workspaceId });
    expect(result).toMatchObject({ canManage: false, canRefresh: false });
    expect(result.providers.map((row) => row.key)).toEqual([
      "google_ads",
      "google_analytics",
      "search_console",
      "business_profile",
      "google_calendar",
      "calendly",
      "fathom",
      "fireflies",
    ]);
    expect(new Set(result.providers.map((row) => row.group))).toEqual(new Set(["google", "calendar", "notes"]));
    // Fireflies needs no setting of Vistrial's own; it is simply not built.
    expect(result.providers.filter((row) => row.readiness !== "not_set_up").map((row) => row.key)).toEqual(["fireflies"]);
    expect(result.providers.every((row) => row.connection === null)).toBe(true);
  });

  it("offers only the built providers once their settings exist, and never names a setting or its value", async () => {
    const { workspaceId, owner } = await setup();
    setGoogle();
    const result = await owner.query(api.integrations.list, { workspaceId });
    expect(result).toMatchObject({ canManage: true, canRefresh: true });
    const state = Object.fromEntries(result.providers.map((row) => [row.key, row.readiness]));
    expect(state).toMatchObject({ google_calendar: "ready", google_ads: "not_built", google_analytics: "not_built", calendly: "not_set_up" });
    const text = JSON.stringify(result);
    expect(text).not.toContain("GOOGLE-APP-SECRET");
    expect(text).not.toContain("GOOGLE_OAUTH_CLIENT");
  });

  it("never returns a token, and keeps each workspace's connections to itself", async () => {
    const { t, workspaceId, otherWorkspace, viewer, stranger } = await setup();
    await connect(t, workspaceId);
    const mine = await viewer.query(api.integrations.list, { workspaceId });
    expect(JSON.stringify(mine)).not.toMatch(/SECRET-ACCESS|SECRET-REFRESH/);
    expect(mine.providers.find((row) => row.key === "google_calendar")?.connection).toMatchObject({
      status: "connected",
      accountLabel: "owner@northpeak.agency",
      agents: ["growth-architect"],
    });
    await expect(stranger.query(api.integrations.list, { workspaceId })).rejects.toThrow();
    const theirs = await stranger.query(api.integrations.list, { workspaceId: otherWorkspace });
    expect(theirs.providers.every((row) => row.connection === null)).toBe(true);
  });
});

describe("connections: sign-in", () => {
  it("lets only an Owner or Admin start, and only for a provider that is set up and built", async () => {
    const { workspaceId, owner, member, viewer, stranger } = await setup();
    await expect(owner.mutation(api.integrations.startConnect, { workspaceId, provider: "google_calendar" })).rejects.toThrow(/not set up on Vistrial yet/);
    setGoogle();
    await expect(viewer.mutation(api.integrations.startConnect, { workspaceId, provider: "google_calendar" })).rejects.toThrow();
    await expect(member.mutation(api.integrations.startConnect, { workspaceId, provider: "google_calendar" })).rejects.toThrow();
    await expect(stranger.mutation(api.integrations.startConnect, { workspaceId, provider: "google_calendar" })).rejects.toThrow();
    await expect(owner.mutation(api.integrations.startConnect, { workspaceId, provider: "google_ads" })).rejects.toThrow(/cannot be connected yet/);
    await expect(owner.mutation(api.integrations.startConnect, { workspaceId, provider: "nope" })).rejects.toThrow(/does not exist/);
  });

  it("opens Google with read-only scopes, offline access, a one-use state and a PKCE challenge", async () => {
    const { t, workspaceId, owner } = await setup();
    setGoogle();
    const { url } = await owner.mutation(api.integrations.startConnect, { workspaceId, provider: "google_calendar", returnOrigin: "https://evil.example" });
    const opened = new URL(url);
    expect(opened.origin + opened.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const query = Object.fromEntries(opened.searchParams);
    expect(query).toMatchObject({
      client_id: "google-client",
      redirect_uri: "https://example.convex.site/integrations/google/callback",
      response_type: "code",
      scope: "openid email https://www.googleapis.com/auth/calendar.events.owned.readonly",
      access_type: "offline",
      prompt: "consent",
      code_challenge_method: "S256",
    });
    expect(url).not.toContain("GOOGLE-APP-SECRET");
    const state = await t.run((ctx) => ctx.db.query("integrationOauthStates").first());
    expect(state).toMatchObject({ nonce: query.state, provider: "google_calendar", workspaceId, userId: "user_owner" });
    // Only Vistrial's own origins are remembered as a place to return to.
    expect(state?.returnOrigin).toBeUndefined();
    expect(await codeChallenge(state!.codeVerifier!)).toBe(query.code_challenge);
  });

  it("finishes a Google sign-in: swaps the code with the verifier, saves the tokens on the server, and sends the Owner back", async () => {
    const { t, workspaceId, owner } = await setup();
    setGoogle();
    const { url } = await owner.mutation(api.integrations.startConnect, { workspaceId, provider: "google_calendar", returnOrigin: "https://app.vistrial.io" });
    const state = new URL(url).searchParams.get("state")!;
    const verifier = (await t.run((ctx) => ctx.db.query("integrationOauthStates").first()))!.codeVerifier!;
    const calls = fakeProvider({
      "https://oauth2.googleapis.com/token": () => ({
        json: {
          access_token: "GOOGLE-ACCESS",
          refresh_token: "GOOGLE-REFRESH",
          expires_in: 3599,
          scope: "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events.owned.readonly",
          id_token: idToken({ sub: "g-123", email: "dana@northpeak.agency" }),
        },
      }),
    });

    const response = await t.fetch(`/integrations/google/callback?state=${state}&code=the-code`);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://app.vistrial.io/app/connections/integrations?integration=google_calendar&outcome=connected");
    const sent = new URLSearchParams(calls[0].body);
    expect(Object.fromEntries(sent)).toEqual({
      grant_type: "authorization_code",
      code: "the-code",
      redirect_uri: "https://example.convex.site/integrations/google/callback",
      code_verifier: verifier,
      client_id: "google-client",
      client_secret: "GOOGLE-APP-SECRET",
    });

    const row = await t.run((ctx) => ctx.db.query("integrationConnections").first());
    expect(row).toMatchObject({
      workspaceId,
      provider: "google_calendar",
      status: "connected",
      accessToken: "GOOGLE-ACCESS",
      refreshToken: "GOOGLE-REFRESH",
      accountId: "g-123",
      accountLabel: "dana@northpeak.agency",
      connectedBy: "user_owner",
    });
    const shown = await owner.query(api.integrations.list, { workspaceId });
    expect(JSON.stringify(shown)).not.toMatch(/GOOGLE-ACCESS|GOOGLE-REFRESH/);
    // The verifier is not kept once it has been used.
    expect((await t.run((ctx) => ctx.db.query("integrationOauthStates").first()))?.codeVerifier).toBeUndefined();
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.some((entry) => entry.action === "integration.connected" && entry.subject === "google_calendar")).toBe(true);

    // The same state does not work twice.
    const again = await t.fetch(`/integrations/google/callback?state=${state}&code=the-code`);
    expect(again.headers.get("Location")).toContain("outcome=expired");
    expect(calls).toHaveLength(1);
  });

  it("finishes a Calendly sign-in with the app's secret in the Authorization header, and names the account", async () => {
    const { t, workspaceId, owner } = await setup();
    setCalendly();
    const { url } = await owner.mutation(api.integrations.startConnect, { workspaceId, provider: "calendly" });
    const opened = new URL(url);
    expect(opened.origin + opened.pathname).toBe("https://auth.calendly.com/oauth/authorize");
    expect(opened.searchParams.get("scope")).toBe("users:read scheduled_events:read");
    expect(opened.searchParams.get("code_challenge")).toBeTruthy();
    const calls = fakeProvider({
      "https://auth.calendly.com/oauth/token": () => ({ json: { access_token: "CAL-ACCESS", refresh_token: "CAL-REFRESH", expires_in: 7200 } }),
      "https://api.calendly.com/users/me": () => ({ json: { resource: { uri: "https://api.calendly.com/users/U1", name: "Dana Ortiz", email: "dana@northpeak.agency" } } }),
    });
    const response = await t.fetch(`/integrations/calendly/callback?state=${opened.searchParams.get("state")}&code=c`);
    expect(response.headers.get("Location")).toContain("integration=calendly&outcome=connected");
    expect(calls[0].headers.Authorization).toBe(`Basic ${btoa("calendly-client:CALENDLY-APP-SECRET")}`);
    expect(calls[0].body).not.toContain("CALENDLY-APP-SECRET");
    expect(calls[1].headers.Authorization).toBe("Bearer CAL-ACCESS");
    const row = await t.run((ctx) => ctx.db.query("integrationConnections").first());
    expect(row).toMatchObject({ provider: "calendly", accountId: "https://api.calendly.com/users/U1", accountLabel: "dana@northpeak.agency", scopes: ["users:read", "scheduled_events:read"] });
  });

  it("saves nothing when the person cancels, unticks the permission, uses another provider's address, or is no longer an Owner or Admin", async () => {
    const { t, workspaceId, owner } = await setup();
    setGoogle();
    setCalendly();
    const start = async (provider = "google_calendar") => new URL((await owner.mutation(api.integrations.startConnect, { workspaceId, provider })).url).searchParams.get("state")!;
    const calls = fakeProvider({
      "https://oauth2.googleapis.com/token": () => ({ json: { access_token: "A", refresh_token: "R", expires_in: 3599, scope: "openid", id_token: idToken({ sub: "g" }) } }),
      "https://oauth2.googleapis.com/revoke": () => ({}),
    });

    const cancelled = await t.fetch(`/integrations/google/callback?state=${await start()}&error=access_denied`);
    expect(cancelled.headers.get("Location")).toContain("outcome=cancelled");
    expect(calls).toHaveLength(0);

    // Google lets a person untick the calendar permission; the token it still issues is cancelled and not kept.
    const unticked = await t.fetch(`/integrations/google/callback?state=${await start()}&code=c`);
    expect(unticked.headers.get("Location")).toContain("outcome=missing_permission");
    expect(calls.map((call) => call.url)).toEqual(["https://oauth2.googleapis.com/token", "https://oauth2.googleapis.com/revoke"]);

    const crossed = await t.fetch(`/integrations/calendly/callback?state=${await start()}&code=c`);
    expect(crossed.headers.get("Location")).toContain("outcome=failed");

    const state = await start();
    await t.run(async (ctx) => {
      const member = await ctx.db.query("members").withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", "user_owner")).unique();
      await ctx.db.patch(member!._id, { role: "member" });
    });
    const demoted = await t.fetch(`/integrations/google/callback?state=${state}&code=c`);
    expect(demoted.headers.get("Location")).toContain("outcome=expired");

    const junk = await t.fetch(`/integrations/google/callback?state=not-a-state&code=c`);
    expect(junk.headers.get("Location")).toBe("https://app.vistrial.io/app/connections/integrations?outcome=expired");
    expect(await t.run((ctx) => ctx.db.query("integrationConnections").collect())).toHaveLength(0);
  });

  it("refuses a sign-in attempt older than ten minutes", async () => {
    const { t, workspaceId, owner } = await setup();
    setGoogle();
    const state = new URL((await owner.mutation(api.integrations.startConnect, { workspaceId, provider: "google_calendar" })).url).searchParams.get("state")!;
    await t.run(async (ctx) => {
      const row = await ctx.db.query("integrationOauthStates").first();
      await ctx.db.patch(row!._id, { createdAt: Date.now() - 11 * 60_000 });
    });
    expect(await t.mutation(internal.integrations.consumeState, { nonce: state })).toBeNull();
  });
});

describe("connections: keeping a token fresh", () => {
  it("uses a token that still has time, without calling the provider", async () => {
    const { t, workspaceId } = await setup();
    setGoogle();
    await connect(t, workspaceId);
    const calls = fakeProvider({});
    expect(await t.action(internal.integrationActions.checkToken, { workspaceId, provider: "google_calendar" })).toEqual({ code: "ok" });
    expect(calls).toHaveLength(0);
  });

  it("renews a token that is about to end and keeps the rotated renewal token", async () => {
    const { t, workspaceId } = await setup();
    setCalendly();
    await connect(t, workspaceId, "calendly", { tokenExpiresAt: Date.now() + 30_000 });
    const calls = fakeProvider({
      "https://auth.calendly.com/oauth/token": () => ({ json: { access_token: "NEW-ACCESS", refresh_token: "NEW-REFRESH", expires_in: 7200 } }),
    });
    expect(await t.action(internal.integrationActions.checkToken, { workspaceId, provider: "calendly" })).toEqual({ code: "ok" });
    expect(Object.fromEntries(new URLSearchParams(calls[0].body))).toEqual({ grant_type: "refresh_token", refresh_token: "SECRET-REFRESH", client_id: "calendly-client" });
    const row = await t.run((ctx) => ctx.db.query("integrationConnections").first());
    expect(row).toMatchObject({ accessToken: "NEW-ACCESS", refreshToken: "NEW-REFRESH", status: "connected" });
    expect(row?.refreshingSince).toBeUndefined();
    expect(row!.tokenExpiresAt! - Date.now()).toBeGreaterThan(7_000_000);
  });

  it("keeps the old renewal token when the provider sends no new one", async () => {
    const { t, workspaceId } = await setup();
    setGoogle();
    await connect(t, workspaceId, "google_calendar", { tokenExpiresAt: Date.now() - 1 });
    fakeProvider({ "https://oauth2.googleapis.com/token": () => ({ json: { access_token: "NEW-ACCESS", expires_in: 3599 } }) });
    expect(await t.action(internal.integrationActions.checkToken, { workspaceId, provider: "google_calendar" })).toEqual({ code: "ok" });
    expect(await t.run((ctx) => ctx.db.query("integrationConnections").first())).toMatchObject({ accessToken: "NEW-ACCESS", refreshToken: "SECRET-REFRESH" });
  });

  it("asks for a reconnect when the provider has signed Vistrial out, as Google does after 7 days in Testing", async () => {
    const { t, workspaceId, owner } = await setup();
    setGoogle();
    await connect(t, workspaceId, "google_calendar", { tokenExpiresAt: Date.now() - 1 });
    fakeProvider({ "https://oauth2.googleapis.com/token": () => ({ status: 400, json: { error: "invalid_grant", error_description: "Token has been expired or revoked." } }) });
    expect(await t.action(internal.integrationActions.checkToken, { workspaceId, provider: "google_calendar" })).toEqual({ code: "token_rejected" });
    const shown = await owner.query(api.integrations.list, { workspaceId });
    expect(shown.providers.find((row) => row.key === "google_calendar")?.connection?.status).toBe("needsReconnect");
    expect(JSON.stringify(shown)).not.toContain("expired or revoked");
  });

  it("does not ask for a reconnect when the provider is only briefly down", async () => {
    const { t, workspaceId } = await setup();
    setGoogle();
    await connect(t, workspaceId, "google_calendar", { tokenExpiresAt: Date.now() - 1 });
    fakeProvider({ "https://oauth2.googleapis.com/token": () => ({ status: 503 }) });
    expect(await t.action(internal.integrationActions.checkToken, { workspaceId, provider: "google_calendar" })).toEqual({ code: "provider_down" });
    const row = await t.run((ctx) => ctx.db.query("integrationConnections").first());
    expect(row).toMatchObject({ status: "connected", refreshToken: "SECRET-REFRESH" });
    expect(row?.refreshingSince).toBeUndefined();
  });

  it("lets only one caller spend a renewal token at a time", async () => {
    const { t, workspaceId } = await setup();
    await connect(t, workspaceId);
    const id = (await t.run((ctx) => ctx.db.query("integrationConnections").first()))!._id;
    expect(await t.mutation(internal.integrations.claimRefresh, { connectionId: id })).toEqual({ state: "claimed", refreshToken: "SECRET-REFRESH" });
    expect(await t.mutation(internal.integrations.claimRefresh, { connectionId: id })).toEqual({ state: "busy" });
    await t.mutation(internal.integrations.saveTokens, { connectionId: id, accessToken: "A2" });
    expect((await t.mutation(internal.integrations.claimRefresh, { connectionId: id })).state).toBe("claimed");
  });
});

describe("connections: disconnect", () => {
  it("lets only an Owner or Admin disconnect, deletes the tokens and every saved read, and asks the provider to cancel the token", async () => {
    const { t, workspaceId, otherWorkspace, owner, member, viewer, stranger } = await setup();
    setGoogle();
    await connect(t, workspaceId);
    await connect(t, workspaceId, "calendly");
    await connect(t, otherWorkspace);
    await t.mutation(internal.integrations.saveSnapshot, { workspaceId, provider: "google_calendar", kind: "bookings", data: { weeks: [] } });
    await t.mutation(internal.integrations.saveSnapshot, { workspaceId, provider: "calendly", kind: "bookings", data: { weeks: [] } });
    await t.mutation(internal.integrations.saveSnapshot, { workspaceId: otherWorkspace, provider: "google_calendar", kind: "bookings", data: { weeks: [] } });
    const calls = fakeProvider({ "https://oauth2.googleapis.com/revoke": () => ({}) });

    await expect(viewer.action(api.integrationActions.disconnect, { workspaceId, provider: "google_calendar" })).rejects.toThrow();
    await expect(member.action(api.integrationActions.disconnect, { workspaceId, provider: "google_calendar" })).rejects.toThrow();
    await expect(stranger.action(api.integrationActions.disconnect, { workspaceId, provider: "google_calendar" })).rejects.toThrow();
    expect(calls).toHaveLength(0);

    expect(await owner.action(api.integrationActions.disconnect, { workspaceId, provider: "google_calendar" })).toEqual({ removed: true, revoked: true });
    expect(new URLSearchParams(calls[0].body).get("token")).toBe("SECRET-REFRESH");
    const left = await t.run(async (ctx) => ({
      connections: (await ctx.db.query("integrationConnections").collect()).map((row) => `${row.workspaceId === workspaceId ? "mine" : "theirs"}:${row.provider}`),
      snapshots: (await ctx.db.query("integrationSnapshots").collect()).map((row) => `${row.workspaceId === workspaceId ? "mine" : "theirs"}:${row.provider}`),
      audit: (await ctx.db.query("auditLog").collect()).filter((row) => row.action === "integration.disconnected").map((row) => row.subject),
    }));
    // Only this workspace's Google Calendar went; its Calendly and the other workspace's data are untouched.
    expect(left.connections.sort()).toEqual(["mine:calendly", "theirs:google_calendar"]);
    expect(left.snapshots.sort()).toEqual(["mine:calendly", "theirs:google_calendar"]);
    expect(left.audit).toEqual(["google_calendar"]);
    // A second press is harmless.
    expect(await owner.action(api.integrationActions.disconnect, { workspaceId, provider: "google_calendar" })).toEqual({ removed: false, revoked: false });
  });

  it("still deletes everything when the provider cannot be reached", async () => {
    const { t, workspaceId, owner } = await setup();
    setGoogle();
    await connect(t, workspaceId);
    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });
    expect(await owner.action(api.integrationActions.disconnect, { workspaceId, provider: "google_calendar" })).toEqual({ removed: true, revoked: false });
    expect(await t.run((ctx) => ctx.db.query("integrationConnections").collect())).toHaveLength(0);
  });

  it("does not let a read that finishes after a disconnect bring the data back", async () => {
    const { t, workspaceId } = await setup();
    await t.mutation(internal.integrations.saveSnapshot, { workspaceId, provider: "google_calendar", kind: "bookings", data: { weeks: [1] } });
    expect(await t.run((ctx) => ctx.db.query("integrationSnapshots").collect())).toHaveLength(0);
  });

  it("drops the last account's reads when a different account connects", async () => {
    const { t, workspaceId } = await setup();
    await connect(t, workspaceId);
    await t.mutation(internal.integrations.saveSnapshot, { workspaceId, provider: "google_calendar", kind: "bookings", data: { weeks: [1] } });
    await connect(t, workspaceId, "google_calendar", { accountId: "acct-2", accountLabel: "sam@northpeak.agency", refreshToken: undefined });
    expect(await t.run((ctx) => ctx.db.query("integrationSnapshots").collect())).toHaveLength(0);
    const row = await t.run((ctx) => ctx.db.query("integrationConnections").first());
    expect(row).toMatchObject({ accountId: "acct-2" });
    // The first account's renewal token is not carried over to the second.
    expect(row?.refreshToken).toBeUndefined();
  });
});

describe("connections: agent access", () => {
  it("lets only an Owner or Admin grant or withdraw an agent", async () => {
    const { t, workspaceId, owner, member } = await setup();
    await connect(t, workspaceId);
    await expect(member.mutation(api.integrations.setAgentAccess, { workspaceId, provider: "google_calendar", agentSlug: "growth-architect", granted: false })).rejects.toThrow();
    await owner.mutation(api.integrations.setAgentAccess, { workspaceId, provider: "google_calendar", agentSlug: "growth-architect", granted: false });
    const shown = await owner.query(api.integrations.list, { workspaceId });
    expect(shown.providers.find((row) => row.key === "google_calendar")?.connection?.agents).toEqual([]);
    await expect(owner.mutation(api.integrations.setAgentAccess, { workspaceId, provider: "google_calendar", agentSlug: "no-such-agent", granted: true })).rejects.toThrow();
  });
});

describe("connections: webhooks", () => {
  const HOOK = "0123456789abcdef0123456789abcdef";
  const body = JSON.stringify({ event: "invitee.created", payload: { email: "prospect@example.com" } });

  async function sign(key: string, message: string) {
    const imported = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return [...new Uint8Array(await crypto.subtle.sign("HMAC", imported, new TextEncoder().encode(message)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  async function hooked() {
    const context = await setup();
    setCalendly();
    await connect(context.t, context.workspaceId, "calendly");
    await context.t.run(async (ctx) => {
      const row = await ctx.db.query("integrationConnections").first();
      await ctx.db.patch(row!._id, { hookId: HOOK });
    });
    return context;
  }
  const post = (t: ReturnType<typeof convexTest>, path: string, signature: string | null, payload = body) =>
    t.fetch(path, { method: "POST", body: payload, headers: signature ? { "Calendly-Webhook-Signature": signature } : {} });

  it("accepts a delivery signed with the app's key, records its kind only, and counts a repeat once", async () => {
    const { t, workspaceId } = await hooked();
    const seconds = Math.floor(Date.now() / 1000);
    const signature = `t=${seconds},v1=${await sign("calendly-signing-key", `${seconds}.${body}`)}`;
    expect((await post(t, `/integrations/webhook/calendly/${HOOK}`, signature)).status).toBe(204);
    expect((await post(t, `/integrations/webhook/calendly/${HOOK}`, signature)).status).toBe(204);
    const events = await t.run((ctx) => ctx.db.query("integrationWebhookEvents").collect());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ workspaceId, provider: "calendly", eventType: "invitee.created" });
    expect(JSON.stringify(events)).not.toContain("prospect@example.com");
  });

  it("refuses a wrong signature, a missing one, an old one, an unknown address and another provider's address, all the same way", async () => {
    const { t } = await hooked();
    const seconds = Math.floor(Date.now() / 1000);
    const good = `t=${seconds},v1=${await sign("calendly-signing-key", `${seconds}.${body}`)}`;
    const old = `t=${seconds - 3600},v1=${await sign("calendly-signing-key", `${seconds - 3600}.${body}`)}`;
    const forged = `t=${seconds},v1=${await sign("someone-elses-key", `${seconds}.${body}`)}`;
    const statuses = [
      (await post(t, `/integrations/webhook/calendly/${HOOK}`, forged)).status,
      (await post(t, `/integrations/webhook/calendly/${HOOK}`, null)).status,
      (await post(t, `/integrations/webhook/calendly/${HOOK}`, old)).status,
      (await post(t, `/integrations/webhook/calendly/${HOOK}`, good, body.replace("created", "canceled"))).status,
      (await post(t, `/integrations/webhook/calendly/${"f".repeat(32)}`, good)).status,
      (await post(t, `/integrations/webhook/fathom/${HOOK}`, good)).status,
      (await post(t, `/integrations/webhook/google_calendar/${HOOK}`, good)).status,
      (await post(t, `/integrations/webhook/calendly/${HOOK}/extra`, good)).status,
    ];
    expect(statuses).toEqual([401, 401, 401, 401, 401, 401, 401, 401]);
    expect(await t.run((ctx) => ctx.db.query("integrationWebhookEvents").collect())).toHaveLength(0);
  });

  it("refuses every delivery while the signing key is not set", async () => {
    const { t } = await hooked();
    delete process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
    const seconds = Math.floor(Date.now() / 1000);
    const signature = `t=${seconds},v1=${await sign("", `${seconds}.${body}`).catch(() => "0".repeat(64))}`;
    expect((await post(t, `/integrations/webhook/calendly/${HOOK}`, signature)).status).toBe(401);
  });
});
