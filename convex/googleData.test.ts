/**
 * @vitest-environment edge-runtime
 *
 * The customer's own Google data, starting with Google Analytics 4: the properties listed from account
 * summaries, one chosen by an Owner or Admin (or for them when there is only one), totals read for that one
 * only, never a write to Google, cited in research as "Your data" only when granted, and everything
 * deleted on disconnect. Google's APIs are stubbed.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { analyticsChoices, analyticsLine, summarizeAnalytics } from "./lib/integrations/google/analytics";
import { saveGoogleSourcesFor } from "./lib/integrations/google/research";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = Date.UTC(2026, 10, 14, 15);
const DAY = 86_400_000;
const person = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });

const SUMMARIES = (count: number) => ({
  accountSummaries: [
    {
      displayName: "Northpeak",
      propertySummaries: [
        { property: "properties/111", displayName: "northpeak.agency" },
        ...(count > 1 ? [{ property: "properties/222", displayName: "Northpeak blog" }] : []),
        { property: "not-a-property", displayName: "ignored" },
      ],
    },
  ],
});
const row = (dims: string[], values: number[]) => ({ dimensionValues: dims.map((value) => ({ value })), metricValues: values.map((value) => ({ value: String(value) })) });
const REPORTS = {
  days: { rows: [row(["20261113"], [40, 30, 2]), row(["20261112"], [60, 50, 3])] },
  sources: { rows: [row(["google / organic"], [70, 4]), row(["(direct) / (none)"], [30, 1])] },
  pages: { rows: [row(["/pricing"], [55, 4]), row(["/"], [45, 1])] },
  events: { rows: [row(["book_call"], [5]), row(["never"], [0])] },
};

describe("Analytics rules", () => {
  it("lists only real properties, as Account · Property", () => {
    expect(analyticsChoices(SUMMARIES(2))).toEqual([
      { id: "properties/111", label: "Northpeak · northpeak.agency" },
      { id: "properties/222", label: "Northpeak · Northpeak blog" },
    ]);
    expect(analyticsChoices(null)).toEqual([]);
  });

  it("condenses the four reports into totals by day, top sources, pages and key events", () => {
    const snapshot = summarizeAnalytics(REPORTS);
    expect(snapshot).toMatchObject({ from: "2026-11-12", to: "2026-11-13", totals: { sessions: 100, users: 80, keyEvents: 5 } });
    expect(snapshot.days.map((day) => day.date)).toEqual(["2026-11-12", "2026-11-13"]);
    expect(snapshot.sources[0]).toEqual({ name: "google / organic", sessions: 70, keyEvents: 4 });
    expect(snapshot.pages[0].path).toBe("/pricing");
    expect(snapshot.events).toEqual([{ name: "book_call", count: 5 }]);
    expect(analyticsLine(snapshot)).toBe("100 sessions and 5 key events from 2026-11-12 to 2026-11-13; most sessions from google / organic (70). As reported by Google Analytics.");
  });
});

describe("a Google Analytics connection", () => {
  let calls: { url: string; method: string; body: unknown }[] = [];
  let properties = 1;
  let refuse = false;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "client-secret");
    calls = [];
    properties = 1;
    refuse = false;
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      calls.push({ url: input, method: init?.method ?? "GET", body: init?.body ? String(init.body) : null });
      if (url.hostname === "oauth2.googleapis.com") return new Response("{}", { status: 200 });
      if (refuse) return new Response("{}", { status: 403 });
      if (url.hostname === "analyticsadmin.googleapis.com") return Response.json(SUMMARIES(properties));
      const body = JSON.parse(String(init!.body)) as { dimensions: { name: string }[] };
      const key = { date: "days", sessionSourceMedium: "sources", landingPage: "pages", eventName: "events" }[body.dimensions[0].name] as keyof typeof REPORTS;
      return Response.json(REPORTS[key]);
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function setup() {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(person("dana"));
    const workspaceId = await owner.mutation(api.workspace.create, { name: "Northpeak" });
    const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: "milo@example.com", role: "member" });
    const member = t.withIdentity(person("milo"));
    await member.mutation(api.workspace.acceptInvite, { token: invite.token });
    await t.run((ctx) =>
      ctx.db.insert("integrationConnections", {
        workspaceId,
        provider: "google_analytics",
        status: "connected",
        accessToken: "ga-token",
        tokenExpiresAt: NOW + DAY,
        scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
        accountId: "sub-1",
        accountLabel: "dana@example.com",
        connectedBy: "dana",
        connectedAt: NOW,
      }),
    );
    return { t, owner, member, workspaceId };
  }

  it("chooses the only property for the person, reads its totals, and never writes to Google", async () => {
    const { t, owner, workspaceId } = await setup();
    expect(await t.action(internal.googleData.syncOne, { workspaceId, provider: "google_analytics" })).toEqual({ code: "ok" });
    const view = await owner.query(api.googleData.view, { workspaceId, provider: "google_analytics" });
    expect(view).toMatchObject({ noun: "property", canChoose: true, selected: { id: "properties/111", label: "Northpeak · northpeak.agency" } });
    expect(view!.summary!.data).toMatchObject({ totals: { sessions: 100, keyEvents: 5 } });
    // Reports were asked for the chosen property only; every other call was a read of the list.
    for (const call of calls.filter((row) => row.method === "POST")) expect(call.url).toBe("https://analyticsdata.googleapis.com/v1beta/properties/111:runReport");
    expect(calls.filter((row) => row.method === "POST")).toHaveLength(4);
    expect(calls.filter((row) => row.method === "GET").map((row) => new URL(row.url).hostname)).toEqual(["analyticsadmin.googleapis.com"]);
  });

  it("waits for an Owner or Admin to choose when there are several, and refuses one the account cannot open", async () => {
    const { t, owner, member, workspaceId } = await setup();
    properties = 2;
    expect(await t.action(internal.googleData.syncOne, { workspaceId, provider: "google_analytics" })).toEqual({ code: "choose" });
    expect((await owner.query(api.googleData.view, { workspaceId, provider: "google_analytics" }))?.selected).toBeNull();
    await expect(member.mutation(api.googleData.choose, { workspaceId, provider: "google_analytics", choiceId: "properties/222" })).rejects.toThrow();
    await expect(owner.mutation(api.googleData.choose, { workspaceId, provider: "google_analytics", choiceId: "properties/999" })).rejects.toThrow(/not one this connection can open/);
    await owner.mutation(api.googleData.choose, { workspaceId, provider: "google_analytics", choiceId: "properties/222" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const view = await member.query(api.googleData.view, { workspaceId, provider: "google_analytics" });
    expect(view).toMatchObject({ canChoose: false, selected: { id: "properties/222" } });
    expect(view!.summary).not.toBeNull();
  });

  it("says Google refused the read, keeps nothing new, and the card shows it", async () => {
    const { t, owner, workspaceId } = await setup();
    refuse = true;
    expect(await t.action(internal.googleData.syncOne, { workspaceId, provider: "google_analytics" })).toEqual({ code: "permission_missing" });
    const list = await owner.query(api.integrations.list, { workspaceId });
    expect(list.providers.find((row) => row.key === "google_analytics")?.connection?.lastSyncCode).toBe("permission_missing");
  });

  it("cites the totals in research only when the connection is granted to that agent", async () => {
    const { t, workspaceId } = await setup();
    await t.action(internal.googleData.syncOne, { workspaceId, provider: "google_analytics" });
    const sources = await t.run(async (ctx) => {
      const runId = await ctx.db.insert("agentRuns", {
        workspaceId,
        agentSlug: "growth-architect",
        skillSlug: "market-intelligence",
        status: "running",
        startedBy: "dana",
        inputRef: "market-intelligence",
        startedAt: NOW,
        costCents: 0,
        inputTokens: 0,
        outputTokens: 0,
      });
      const projectId = await ctx.db.insert("researchProjects", {
        workspaceId,
        title: "Market",
        objective: "",
        market: "",
        geography: "",
        competitors: [],
        platforms: ["customerData"],
        suppliedUrls: [],
        status: "draft",
        createdBy: "dana",
        createdAt: NOW,
        updatedAt: NOW,
      });
      const project = (await ctx.db.get(projectId))!;
      const strategist = await saveGoogleSourcesFor(ctx, { workspaceId, project, runId: runId as Id<"agentRuns">, agentSlug: "growth-architect" });
      const dealmaker = await saveGoogleSourcesFor(ctx, { workspaceId, project, runId: runId as Id<"agentRuns">, agentSlug: "sales-conversion" });
      const saved = await ctx.db.query("sourceRefs").collect();
      return { strategist, dealmaker, saved };
    });
    expect(sources.strategist).toHaveLength(1);
    expect(sources.strategist[0].label).toBe("Your Google Analytics: Northpeak · northpeak.agency");
    expect(sources.dealmaker).toEqual([]);
    expect(sources.saved.map((row) => row.platform)).toEqual(["customerData", "customerData", "customerData"]);
    expect(sources.saved[0].excerpt).toContain("100 sessions and 5 key events");
  });

  it("deletes the choice, the totals and the token on disconnect", async () => {
    const { t, owner, workspaceId } = await setup();
    await t.action(internal.googleData.syncOne, { workspaceId, provider: "google_analytics" });
    await owner.action(api.integrationActions.disconnect, { workspaceId, provider: "google_analytics" });
    expect(await owner.query(api.googleData.view, { workspaceId, provider: "google_analytics" })).toBeNull();
    const left = await t.run(async (ctx) => ({
      connections: await ctx.db.query("integrationConnections").collect(),
      snapshots: await ctx.db.query("integrationSnapshots").collect(),
    }));
    expect(left).toEqual({ connections: [], snapshots: [] });
    expect(calls.at(-1)?.url).toBe("https://oauth2.googleapis.com/revoke");
  });
});
