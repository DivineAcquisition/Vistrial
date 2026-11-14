/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { RawResponse } from "./lib/pageReader/read";
import { SAMPLE_ABOUT, SAMPLE_BOOK, SAMPLE_CSS, SAMPLE_GUIDE, SAMPLE_HOME, SAMPLE_LOGO, SAMPLE_PRICING, SAMPLE_SITE, SAMPLE_WORDS } from "./lib/siteCapture/sample";
import type { ScriptedModel } from "./lib/toolRouter";
import { freeScope, nameFromHost, shownStage } from "./onboarding";
import type { ScriptedPages } from "./pageReadActions";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

function person(subject: string, name = "Jaylen Brooks") {
  return {
    subject,
    email: `${subject}@example.com`,
    name,
    issuer: "https://clerk.vistrial.test",
    tokenIdentifier: `https://clerk.vistrial.test|${subject}`,
    secondFactor: true,
  };
}

const BUSINESS = { name: "DivineACQ", website: "", offer: "Growth systems for cleaning businesses", area: "United States", audience: "Cleaning company owners" };
const CONFIRM = {
  person: { fullName: "Jaylen Brooks", role: "Owner" },
  business: { name: "DivineACQ", offer: BUSINESS.offer, area: BUSINESS.area, audience: BUSINESS.audience },
  goal: { kind: "leads", text: "More booked jobs" },
};

type Globals = { __vistrialScriptedPages?: ScriptedPages; __vistrialScriptedRenderer?: null; __vistrialScriptedModel?: ScriptedModel };
const respond = (text: string | Uint8Array, extra: Partial<RawResponse> = {}): RawResponse => {
  const body = typeof text === "string" ? new TextEncoder().encode(text) : text;
  return { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body, truncated: false, wireBytes: body.byteLength, address: "93.184.216.34", ...extra };
};

/** The sample coaching site and a model that quotes it. No real site or model is called. */
function scriptSite() {
  (globalThis as Globals).__vistrialScriptedPages = (url) => {
    if (url.pathname === "/robots.txt") return respond("", { status: 404 });
    const pages: Record<string, RawResponse> = {
      "/": respond(SAMPLE_HOME),
      "/pricing": respond(SAMPLE_PRICING),
      "/book": respond(SAMPLE_BOOK),
      "/free-guide": respond(SAMPLE_GUIDE),
      "/about": respond(SAMPLE_ABOUT),
      "/assets/site.css": respond(SAMPLE_CSS, { headers: { "content-type": "text/css" } }),
      "/logo.png": respond(SAMPLE_LOGO, { headers: { "content-type": "image/png" } }),
    };
    return pages[url.pathname] ?? respond("", { status: 404 });
  };
  (globalThis as Globals).__vistrialScriptedRenderer = null;
  (globalThis as Globals).__vistrialScriptedModel = () => ({ text: JSON.stringify(SAMPLE_WORDS) });
}

async function settle(t: ReturnType<typeof convexTest>) {
  for (let i = 0; i < 40; i += 1) {
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
  }
}

/** Through the steps without a website. */
async function walk(t: ReturnType<typeof convexTest>, subject: string) {
  const me = t.withIdentity(person(subject));
  await me.mutation(api.onboarding.skipWebsite, {});
  await me.mutation(api.onboarding.goTo, { stage: "confirm" });
  return me;
}

describe("onboarding: website, connect, confirm", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Globals).__vistrialScriptedPages;
    delete (globalThis as Globals).__vistrialScriptedRenderer;
    delete (globalThis as Globals).__vistrialScriptedModel;
  });

  it("starts a new person at the website step with their Clerk name, and shows the old wizard's stages as that step", async () => {
    const t = convexTest(schema, modules);
    const me = t.withIdentity(person("new-1"));
    const view = await me.query(api.onboarding.mine, {});
    expect(view).toMatchObject({ stage: "website", step: 0, workspaceId: null, captureId: null });
    expect(view.person.fullName).toBe("Jaylen Brooks");
    // Someone part-way through the old wizard keeps what they typed and lands on the website step.
    await t.run((ctx) =>
      ctx.db.insert("onboarding", {
        userId: "old-wizard",
        stage: "goal",
        person: { fullName: "Old Wizard", role: "Owner", phone: "", heardFrom: "" },
        business: BUSINESS,
        goal: { kind: "", text: "" },
        site: { status: "idle", url: "", summary: "", offer: "", area: "", audience: "", competitors: [], costCents: 0 },
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const old = await t.withIdentity(person("old-wizard")).query(api.onboarding.mine, {});
    expect(old).toMatchObject({ stage: "website", business: { name: "DivineACQ" } });
    expect(shownStage("review")).toBe("website");
    expect(nameFromHost("https://www.brightline-media.example.com/")).toBe("Brightline Media");
  });

  it("treats someone already in a workspace as done", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.agents, {});
    const me = t.withIdentity(person("old-1"));
    await me.mutation(api.workspace.create, { name: "Existing" });
    expect((await me.query(api.onboarding.mine, {})).stage).toBe("done");
  });

  it("makes the organization from the website, reads it for free, and uses only what the person confirms", async () => {
    vi.useFakeTimers();
    scriptSite();
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.agents, {});
    await t.run((ctx) => ctx.db.insert("modelRoutes", { workKind: "classify", provider: "fake", model: "fake-scripted", fallbackProvider: "fake", fallbackModel: "fake-scripted" }));
    const me = t.withIdentity(person("site-1"));
    await expect(me.mutation(api.onboarding.goTo, { stage: "connect" })).rejects.toThrow(/website first/);
    await expect(me.mutation(api.onboarding.submitWebsite, { url: "not a site" })).rejects.toThrow(/website address/);

    const captureId = await me.mutation(api.onboarding.submitWebsite, { url: "northbound-coaching.example.com/pricing" });
    const started = await me.query(api.onboarding.mine, {});
    expect(started).toMatchObject({ stage: "website", captureId, business: { website: SAMPLE_SITE } });
    const workspaceId = started.workspaceId as Id<"workspaces">;
    expect((await t.run((ctx) => ctx.db.get(workspaceId)))?.name).toBe("Northbound Coaching");
    // The same address again is the same reading.
    expect(await me.mutation(api.onboarding.submitWebsite, { url: SAMPLE_SITE })).toBe(captureId);
    await settle(t);
    const capture = await me.query(api.siteCapture.get, { workspaceId, captureId });
    expect(capture).toMatchObject({ status: "done", free: true });

    await me.mutation(api.onboarding.goTo, { stage: "connect" });
    await me.mutation(api.onboarding.goTo, { stage: "confirm" });
    expect((await me.query(api.onboarding.mine, {})).stage).toBe("confirm");
    await expect(me.mutation(api.onboarding.confirm, { ...CONFIRM, goal: { kind: "", text: "" } })).rejects.toThrow(/main goal/);

    await me.mutation(api.onboarding.confirm, {
      ...CONFIRM,
      business: { ...CONFIRM.business, name: "Northbound Coaching Ltd" },
      choices: { take: ["colors", "headingFont", "bodyFont", "tone", "offers", "logo"], logoOwned: true, edits: { tone: "Calm and direct." } },
      teardownPages: ["p1", "p3", "p9", "b1"],
      serviceTeamAccess: true,
    });
    const after = await me.query(api.onboarding.mine, {});
    expect(after).toMatchObject({ stage: "freeSession", teardownPages: ["p1", "p3"], business: { name: "Northbound Coaching Ltd", website: SAMPLE_SITE } });
    // Confirming twice is harmless.
    expect(await me.mutation(api.onboarding.confirm, CONFIRM)).toBe(workspaceId);

    await t.run(async (ctx) => {
      expect((await ctx.db.get(workspaceId))?.name).toBe("Northbound Coaching Ltd");
      const profile = await ctx.db.query("profileVersions").filter((q) => q.eq(q.field("workspaceId"), workspaceId)).collect();
      expect(profile).toMatchObject([{ status: "confirmed", offer: BUSINESS.offer, priceNotes: "Agency Growth Program: $2,500", brandVoice: "Calm and direct." }]);
      const kit = await ctx.db.query("brandKitVersions").first();
      expect(kit).toMatchObject({ origin: "site", tone: "Calm and direct.", headingFont: "Fraunces", logosOwned: true });
      const cards = await ctx.db.query("offerCardVersions").collect();
      expect(cards.map((row) => row.origin)).toEqual(["site", "site"]);
      const facts = await ctx.db.query("businessFacts").collect();
      expect(facts.find((row) => row.factKey === "mainGoal")).toMatchObject({ value: "Get more leads: More booked jobs", status: "verified" });
      expect(facts.find((row) => row.factKey === "website")).toMatchObject({ sourceType: "site", status: "verified" });
      const agent = await ctx.db.query("agents").withIndex("by_slug", (q) => q.eq("slug", "growth-architect")).unique();
      const link = await ctx.db.query("workspaceAgents").filter((q) => q.eq(q.field("agentId"), agent!._id)).first();
      expect(link?.state).toBe("on");
    });
  });

  it("reads the site for free at most three times while onboarding", async () => {
    vi.useFakeTimers();
    scriptSite();
    const t = convexTest(schema, modules);
    const me = t.withIdentity(person("site-2"));
    await me.mutation(api.onboarding.submitWebsite, { url: "one.example.com" });
    await me.mutation(api.onboarding.submitWebsite, { url: "two.example.com" });
    await me.mutation(api.onboarding.submitWebsite, { url: "three.example.com" });
    await expect(me.mutation(api.onboarding.submitWebsite, { url: "four.example.com" })).rejects.toThrow(/read 3 times/);
    expect(await t.run((ctx) => ctx.db.query("billingLedger").collect())).toHaveLength(0);
  });

  it("works without a website, and keeps service team access off when the owner says so", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.agents, {});
    const me = await walk(t, "new-3");
    const workspaceId = await me.mutation(api.onboarding.confirm, { ...CONFIRM, serviceTeamAccess: false });
    expect((await me.query(api.onboarding.mine, {})).stage).toBe("freeSession");
    await t.mutation(internal.staffAdmin.enroll, { userId: "staff-9", role: "service_team" });
    const staff = t.withIdentity(person("staff-9"));
    await expect(staff.mutation(api.staff.grant, { workspaceId, reason: "Helping with setup", hours: 4 })).rejects.toThrow(/turned off/);
    await expect(me.mutation(api.onboarding.goTo, { stage: "website" })).rejects.toThrow(/already saved/);
  });
});

async function finished(subject: string) {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.agents, {});
  const me = await walk(t, subject);
  const workspaceId = await me.mutation(api.onboarding.confirm, CONFIRM);
  return { t, me, workspaceId };
}

const failRun = (t: ReturnType<typeof convexTest>, runId: Id<"agentRuns">, costCents: number) =>
  t.mutation(internal.runs.fail, { runId, index: 0, idempotencyKey: `fail-${runId}`, code: "provider_error", kind: "model", costCents });

describe("free research session", () => {
  afterEach(() => {
    delete process.env.AUTUMN_SECRET_KEY;
  });

  it("scopes the session from the wizard: goal, offer, area, the website and competitors the site named", () => {
    const scope = freeScope({
      business: { ...BUSINESS, website: "https://divineacquisition.io/" },
      goal: { kind: "leads", text: "More booked jobs" },
      site: { status: "read", url: "https://divineacquisition.io/", summary: "", offer: "", area: "", audience: "", competitors: ["Sparkle", "Shine"], costCents: 0 },
    });
    expect(scope.title).toBe("DivineACQ: free research session");
    expect(scope.objective).toMatch(/^Find the three best ways for DivineACQ to win more customers for Growth systems for cleaning businesses in United States/);
    expect(scope.objective).toMatch(/In their words: More booked jobs/);
    expect(scope).toMatchObject({ market: BUSINESS.offer, geography: BUSINESS.area, suppliedUrls: ["https://divineacquisition.io/"] });
    expect(scope.competitors).toEqual([{ name: "Sparkle" }, { name: "Shine" }]);
    expect(scope.platforms.length).toBeGreaterThan(1);

    // Text read from a website keeps its full stops; the objective doesn't double them.
    const read = freeScope({
      business: { ...BUSINESS, offer: "AI sales systems, installed for client teams.", audience: "Small service businesses." },
      goal: { kind: "leads", text: "" },
      site: { status: "read", url: "", summary: "", offer: "", area: "", audience: "", competitors: [], costCents: 0 },
    });
    expect(read.objective).toBe(
      "Find the three best ways for DivineACQ to win more customers for AI sales systems, installed for client teams in United States, from what competitors there do that works. Their customers: Small service businesses.",
    );
    expect(read.suppliedUrls).toEqual([]);
  });

  it("starts once, without credit, while new paid work is still blocked at zero", async () => {
    const { t, me, workspaceId } = await finished("free-1");
    process.env.AUTUMN_SECRET_KEY = "am_sk_test";
    const first = await me.mutation(api.onboarding.startFree, {});
    expect(await me.mutation(api.onboarding.startFree, {})).toEqual(first);
    await t.run(async (ctx) => {
      const run = await ctx.db.get(first.runId);
      expect(run).toMatchObject({ free: true, skillSlug: "market-intelligence", status: "queued", inputRef: first.projectId });
      const project = await ctx.db.get(first.projectId);
      expect(project).toMatchObject({ workspaceId, title: "DivineACQ: free research session", status: "ready" });
    });
    const view = await me.query(api.onboarding.mine, {});
    expect(view).toMatchObject({ stage: "freeSession", freeProjectId: first.projectId, freeRunId: first.runId, freeAttempts: 1 });
    await expect(
      me.mutation(api.runs.start, { workspaceId, agentSlug: "growth-architect", skillSlug: "market-intelligence", projectId: first.projectId }),
    ).rejects.toThrow(/credit balance is empty|run in progress/);
  });

  it("never charges the free session, and allows one retry when it stops without a report", async () => {
    const { t, me } = await finished("free-2");
    process.env.AUTUMN_SECRET_KEY = "am_sk_test";
    const first = await me.mutation(api.onboarding.startFree, {});
    await failRun(t, first.runId, 40);
    await t.run(async (ctx) => {
      expect((await ctx.db.get(first.runId))?.costCents).toBe(40);
      expect(await ctx.db.query("billingLedger").collect()).toHaveLength(0);
    });
    const second = await me.mutation(api.onboarding.startFree, {});
    expect(second.projectId).toBe(first.projectId);
    expect(second.runId).not.toBe(first.runId);
    await failRun(t, second.runId, 10);
    await expect(me.mutation(api.onboarding.startFree, {})).rejects.toThrow(/tried twice/);
  });

  it("is only for the person onboarding, in the free-session stage", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.agents, {});
    const me = await walk(t, "free-3");
    await expect(me.mutation(api.onboarding.startFree, {})).rejects.toThrow(/isn't open/);
  });

  it("shows the paywall, and unlocks only once the plan is paid", async () => {
    const { t, me, workspaceId } = await finished("free-4");
    process.env.AUTUMN_SECRET_KEY = "am_sk_test";
    await me.mutation(api.onboarding.showPaywall, { open: true });
    expect((await me.query(api.onboarding.mine, {})).stage).toBe("paywall");
    expect(await me.mutation(api.onboarding.unlock, {})).toEqual({ unlocked: false });
    await me.mutation(api.onboarding.showPaywall, { open: false });
    expect((await me.query(api.onboarding.mine, {})).stage).toBe("freeSession");

    // A plan that is not paid for yet does not unlock.
    await t.mutation(internal.billing.saveAccount, { workspaceId, balanceCents: 0, planId: "growth", planStatus: "incomplete" });
    expect((await me.query(api.onboarding.mine, {})).stage).toBe("freeSession");
    // Autumn reports the paid plan: the mirror's update moves the person on.
    await t.mutation(internal.billing.saveAccount, { workspaceId, balanceCents: 4000, planId: "growth", planStatus: "active" });
    const view = await me.query(api.onboarding.mine, {});
    expect(view.stage).toBe("guide");
    expect(view.billing.paid).toBe(true);
    // Moving back to the paywall after paying does nothing.
    await me.mutation(api.onboarding.showPaywall, { open: true });
    expect((await me.query(api.onboarding.mine, {})).stage).toBe("guide");
  });

  it("lets the person straight through when this deployment has no billing", async () => {
    const { me } = await finished("free-5");
    await me.mutation(api.onboarding.showPaywall, { open: true });
    expect(await me.mutation(api.onboarding.unlock, {})).toEqual({ unlocked: true });
    expect((await me.query(api.onboarding.mine, {})).stage).toBe("guide");
  });
});

describe("credits granted by Vistrial", () => {
  it("lift the paywall and leave an audit row naming who granted how much and why", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.agents, {});
    const me = await walk(t, "grant-1");
    const workspaceId = (await me.mutation(api.onboarding.confirm, CONFIRM)) as Id<"workspaces">;
    await t.run(async (ctx) => {
      const row = await ctx.db.query("onboarding").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).first();
      await ctx.db.patch(row!._id, { stage: "paywall" });
    });
    await t.mutation(internal.billing.recordGrant, { workspaceId, amountCents: 10_000, reason: "Owner's own workspace", grantedBy: "owner-request" });
    const stage = await t.run(async (ctx) => (await ctx.db.query("onboarding").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).first())!.stage);
    expect(stage).toBe("guide");
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.map((row) => row.action)).toEqual(expect.arrayContaining(["billing.credits_granted", "onboarding.unlocked_by_grant"]));
    expect(audit.find((row) => row.action === "billing.credits_granted")?.subject).toBe("10000c: Owner's own workspace");
  });

  it("refuses a grant with no reason or an amount out of range, before calling Autumn", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.agents, {});
    const me = await walk(t, "grant-2");
    const workspaceId = (await me.mutation(api.onboarding.confirm, CONFIRM)) as Id<"workspaces">;
    const grant = (amountCents: number, reason = "Testing the product") =>
      t.action(internal.billingActions.grantCredits, { workspaceId, amountCents, reason, grantedBy: "test" });
    await expect(grant(0)).rejects.toThrow(/between 1 and/);
    await expect(grant(100_001)).rejects.toThrow(/between 1 and/);
    await expect(grant(1.5)).rejects.toThrow(/between 1 and/);
    await expect(grant(500, "  ")).rejects.toThrow(/reason/);
  });
});
