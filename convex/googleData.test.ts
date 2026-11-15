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
import { accountNames, locationChoices, profileLine, profileQueries, summarizeProfile } from "./lib/integrations/google/businessProfile";
import { accountChoice, adsLine, customerIds, summarizeAds } from "./lib/integrations/google/googleAds";
import { saveGoogleSourcesFor } from "./lib/integrations/google/research";
import { searchChoices, searchLine, searchRequests, summarizeSearch } from "./lib/integrations/google/searchConsole";
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

describe("Search Console", () => {
  const SITES = {
    siteEntry: [
      { siteUrl: "sc-domain:northpeak.agency", permissionLevel: "siteOwner" },
      { siteUrl: "https://blog.northpeak.agency/", permissionLevel: "siteUnverifiedUser" },
      { siteUrl: "not a site", permissionLevel: "siteOwner" },
    ],
  };
  const srow = (key: string, clicks: number, impressions: number, position: number) => ({ keys: [key], clicks, impressions, ctr: clicks / impressions, position });
  const ANSWERS = {
    days: { rows: [srow("2026-11-11", 10, 200, 8), srow("2026-11-10", 30, 300, 4)] },
    queries: { rows: [srow("marketing agency for dentists", 25, 150, 3.24)] },
    pages: { rows: [srow("https://northpeak.agency/", 40, 500, 6)] },
  };

  it("lists only verified sites, asks for 28 days ending three days ago, and weights average position by impressions", () => {
    expect(searchChoices(SITES)).toEqual([{ id: "sc-domain:northpeak.agency", label: "northpeak.agency" }]);
    const requests = searchRequests(NOW);
    expect(requests.days).toMatchObject({ startDate: "2026-10-15", endDate: "2026-11-11", dimensions: ["date"] });
    const snapshot = summarizeSearch(ANSWERS, requests.days);
    expect(snapshot.totals).toEqual({ clicks: 40, impressions: 500, ctr: 0.08, position: 5.6 });
    expect(snapshot.days.map((row) => row.date)).toEqual(["2026-11-10", "2026-11-11"]);
    expect(snapshot.queries[0]).toEqual({ name: "marketing agency for dentists", clicks: 25, impressions: 150, ctr: 0.1667, position: 3.2 });
    expect(searchLine(snapshot)).toBe(
      '40 clicks from 500 impressions (click rate 8.0%, average position 5.6) from 2026-10-15 to 2026-11-11; top query "marketing agency for dentists" (25 clicks). As reported by Search Console.',
    );
  });

  it("reads Search Analytics only, for the chosen site, and cites it in research", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "client-secret");
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      calls.push({ url: input, method: init?.method ?? "GET" });
      if (input === "https://www.googleapis.com/webmasters/v3/sites") return Response.json(SITES);
      const body = JSON.parse(String(init!.body)) as { dimensions: string[] };
      return Response.json(ANSWERS[{ date: "days", query: "queries", page: "pages" }[body.dimensions[0]] as keyof typeof ANSWERS]);
    });
    try {
      const t = convexTest(schema, modules);
      const owner = t.withIdentity(person("dana"));
      const workspaceId = await owner.mutation(api.workspace.create, { name: "Northpeak" });
      await t.run((ctx) =>
        ctx.db.insert("integrationConnections", {
          workspaceId,
          provider: "search_console",
          status: "connected",
          accessToken: "sc-token",
          tokenExpiresAt: NOW + DAY,
          scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
          accountId: "sub-1",
          accountLabel: "dana@example.com",
          connectedBy: "dana",
          connectedAt: NOW,
        }),
      );
      expect(await t.action(internal.googleData.syncOne, { workspaceId, provider: "search_console" })).toEqual({ code: "ok" });
      const view = await owner.query(api.googleData.view, { workspaceId, provider: "search_console" });
      expect(view).toMatchObject({ noun: "site", selected: { id: "sc-domain:northpeak.agency" } });
      expect(view!.summary!.data).toMatchObject({ totals: { clicks: 40, impressions: 500 } });
      const posts = calls.filter((row) => row.method === "POST");
      expect(posts).toHaveLength(3);
      for (const call of posts) expect(call.url).toBe("https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Anorthpeak.agency/searchAnalytics/query");
      const known = await t.run(async (ctx) => {
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
        return saveGoogleSourcesFor(ctx, { workspaceId, project: (await ctx.db.get(projectId))!, runId, agentSlug: "growth-architect" });
      });
      expect(known.map((row) => row.label)).toEqual(["Your Google Search results: northpeak.agency"]);
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
});

describe("Google Ads", () => {
  const LIST = { resourceNames: ["customers/1234567890", "customers/2223334444", "customers/9998887777", "bad"] };
  const NAMES: Record<string, unknown> = {
    "1234567890": { results: [{ customer: { id: "1234567890", descriptiveName: "Northpeak Agency", manager: false, currencyCode: "USD" } }] },
    "2223334444": { results: [{ customer: { id: "2223334444", descriptiveName: "Northpeak MCC", manager: true } }] },
  };
  const result = (id: string, name: string, status: string, date: string, costMicros: string, clicks: string, conversions: number, value: number) => ({
    customer: { currencyCode: "USD" },
    campaign: { id, name, status, advertisingChannelType: "SEARCH" },
    segments: { date },
    metrics: { costMicros, impressions: "1000", clicks, conversions, conversionsValue: value },
  });
  const PAGE1 = {
    results: [result("1", "Dentists, search", "ENABLED", "2026-11-12", "125500000", "40", 3, 900), result("2", "Brand", "PAUSED", "2026-11-12", "10000000", "12", 1, 300)],
    nextPageToken: "p2",
  };
  const PAGE2 = { results: [result("1", "Dentists, search", "ENABLED", "2026-11-13", "74500000", "30", 2, 600)] };

  it("names accounts but leaves managers out, and adds up campaigns by spend and by day", () => {
    expect(customerIds(LIST)).toEqual(["1234567890", "2223334444", "9998887777"]);
    expect(accountChoice("1234567890", NAMES["1234567890"])).toEqual({ id: "1234567890", label: "Northpeak Agency (123-456-7890)" });
    expect(accountChoice("2223334444", NAMES["2223334444"])).toBeNull();
    const snapshot = summarizeAds([...PAGE1.results, ...PAGE2.results], false);
    expect(snapshot.totals).toEqual({ spend: 210, impressions: 3000, clicks: 82, conversions: 6, value: 1800, campaigns: 2, active: 1 });
    expect(snapshot.campaigns[0]).toMatchObject({ name: "Dentists, search", spend: 200, status: "enabled", type: "search" });
    expect(snapshot.days).toEqual([
      { date: "2026-11-12", spend: 135.5, clicks: 52, conversions: 4 },
      { date: "2026-11-13", spend: 74.5, clicks: 30, conversions: 2 },
    ]);
    expect(adsLine(snapshot)).toBe(
      "$210.00 spent, 82 clicks and 6 conversions (value $1,800) from 2026-11-12 to 2026-11-13, across 2 campaigns; most spend on Dentists, search ($200.00). As reported by Google Ads.",
    );
  });

  it("only ever calls the two read methods, follows pages, and skips an account it cannot read", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "client-secret");
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      urls.push(input);
      if (input.endsWith("/customers:listAccessibleCustomers")) return Response.json(LIST);
      const id = /customers\/(\d+)\/googleAds:search$/.exec(input)?.[1] ?? "";
      const body = JSON.parse(String(init!.body)) as { query: string; pageToken?: string };
      if (body.query.includes("FROM customer")) return NAMES[id] ? Response.json(NAMES[id]) : new Response("{}", { status: 403 });
      return Response.json(body.pageToken === "p2" ? PAGE2 : PAGE1);
    });
    try {
      const t = convexTest(schema, modules);
      const owner = t.withIdentity(person("dana"));
      const workspaceId = await owner.mutation(api.workspace.create, { name: "Northpeak" });
      await t.run((ctx) =>
        ctx.db.insert("integrationConnections", {
          workspaceId,
          provider: "google_ads",
          status: "connected",
          accessToken: "ads-token",
          tokenExpiresAt: NOW + DAY,
          scopes: ["https://www.googleapis.com/auth/adwords"],
          accountId: "sub-1",
          accountLabel: "dana@example.com",
          connectedBy: "dana",
          connectedAt: NOW,
        }),
      );
      expect(await t.action(internal.googleData.syncOne, { workspaceId, provider: "google_ads" })).toEqual({ code: "ok" });
      const view = await owner.query(api.googleData.view, { workspaceId, provider: "google_ads" });
      expect(view?.choices).toEqual([{ id: "1234567890", label: "Northpeak Agency (123-456-7890)" }]);
      expect(view?.summary?.data).toMatchObject({ totals: { spend: 210, conversions: 6 } });
      expect(urls.every((url) => url.endsWith("/customers:listAccessibleCustomers") || url.endsWith("/googleAds:search"))).toBe(true);
      expect(urls.some((url) => /mutate/i.test(url))).toBe(false);
      expect(urls.filter((url) => url === "https://googleads.googleapis.com/v22/customers/1234567890/googleAds:search")).toHaveLength(3);
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
});

describe("Google Business Profile", () => {
  const ACCOUNTS = { accounts: [{ name: "accounts/1" }, { name: "bad" }] };
  const LOCATIONS = { locations: [{ name: "locations/77", title: "Northpeak Agency", storefrontAddress: { locality: "Denver" } }] };
  const series = (dailyMetric: string, values: [number, number, number, string][]) => ({
    dailyMetric,
    timeSeries: { datedValues: values.map(([year, month, day, value]) => ({ date: { year, month, day }, value })) },
  });
  const DAILY = {
    multiDailyMetricTimeSeries: [
      {
        dailyMetricTimeSeries: [
          series("BUSINESS_IMPRESSIONS_MOBILE_SEARCH", [[2026, 11, 13, "40"]]),
          series("BUSINESS_IMPRESSIONS_DESKTOP_MAPS", [
            [2026, 11, 13, "10"],
            [2026, 11, 12, "5"],
          ]),
          series("CALL_CLICKS", [[2026, 11, 13, "3"]]),
          series("BUSINESS_DIRECTION_REQUESTS", [[2026, 11, 12, "2"]]),
          series("WEBSITE_CLICKS", [[2026, 11, 13, "7"]]),
        ],
      },
    ],
  };
  const KEYWORDS = {
    searchKeywordsCounts: [
      { searchKeyword: "marketing agency denver", insightsValue: { value: "120" } },
      { searchKeyword: "northpeak", insightsValue: { threshold: "15" } },
    ],
  };

  it("names locations by title and town, and adds views, calls, directions and clicks, with last month's search terms", () => {
    expect(accountNames(ACCOUNTS)).toEqual(["accounts/1"]);
    expect(locationChoices(LOCATIONS)).toEqual([{ id: "locations/77", label: "Northpeak Agency, Denver" }]);
    const query = profileQueries(NOW);
    expect(query).toMatchObject({ from: "2026-10-17", to: "2026-11-13", month: "2026-10" });
    expect(query.daily).toContain("dailyMetrics=CALL_CLICKS");
    const snapshot = summarizeProfile(DAILY, KEYWORDS, query);
    expect(snapshot.totals).toEqual({ views: 55, searchViews: 40, mapsViews: 15, calls: 3, directions: 2, websiteClicks: 7 });
    expect(snapshot.days).toEqual([
      { date: "2026-11-12", views: 5, actions: 2 },
      { date: "2026-11-13", views: 50, actions: 10 },
    ]);
    expect(snapshot.keywords).toEqual([
      { term: "marketing agency denver", count: 120, fewerThan: null },
      { term: "northpeak", count: null, fewerThan: 15 },
    ]);
    expect(profileLine(snapshot)).toContain("55 views (40 on Search, 15 on Maps), 3 calls, 2 direction requests and 7 website clicks");
  });

  async function connected() {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(person("dana"));
    const workspaceId = await owner.mutation(api.workspace.create, { name: "Northpeak" });
    await t.run((ctx) =>
      ctx.db.insert("integrationConnections", {
        workspaceId,
        provider: "business_profile",
        status: "connected",
        accessToken: "gbp-token",
        tokenExpiresAt: NOW + DAY,
        scopes: ["https://www.googleapis.com/auth/business.manage"],
        accountId: "sub-1",
        accountLabel: "dana@example.com",
        connectedBy: "dana",
        connectedAt: NOW,
      }),
    );
    return { t, owner, workspaceId };
  }

  function stub(answer: (url: URL) => Response) {
    const methods: string[] = [];
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      methods.push(init?.method ?? "GET");
      return answer(new URL(input));
    });
    return methods;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "client-secret");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("says it is waiting for Google's approval while the APIs refuse, whether by 403 or a zero quota", async () => {
    for (const status of [403, 429]) {
      const { t, owner, workspaceId } = await connected();
      stub(() => new Response("{}", { status }));
      expect(await t.action(internal.googleData.syncOne, { workspaceId, provider: "business_profile" })).toEqual({ code: "awaiting_approval" });
      expect(await owner.query(api.googleData.view, { workspaceId, provider: "business_profile" })).toMatchObject({ lastSyncCode: "awaiting_approval", summary: null });
    }
  });

  it("once approved, reads the chosen location with GET requests only", async () => {
    const { t, owner, workspaceId } = await connected();
    const methods = stub((url) => {
      if (url.hostname === "mybusinessaccountmanagement.googleapis.com") return Response.json(ACCOUNTS);
      if (url.hostname === "mybusinessbusinessinformation.googleapis.com") return Response.json(LOCATIONS);
      if (url.pathname.endsWith(":fetchMultiDailyMetricsTimeSeries"))
        return url.pathname === "/v1/locations/77:fetchMultiDailyMetricsTimeSeries" ? Response.json(DAILY) : new Response("{}", { status: 404 });
      return Response.json(KEYWORDS);
    });
    expect(await t.action(internal.googleData.syncOne, { workspaceId, provider: "business_profile" })).toEqual({ code: "ok" });
    const view = await owner.query(api.googleData.view, { workspaceId, provider: "business_profile" });
    expect(view).toMatchObject({ noun: "location", selected: { id: "locations/77", label: "Northpeak Agency, Denver" } });
    expect(view!.summary!.data).toMatchObject({ totals: { views: 55, calls: 3 } });
    expect(methods.every((method) => method === "GET")).toBe(true);
  });
});
