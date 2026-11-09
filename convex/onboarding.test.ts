/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import { freeScope, siteDomains } from "./onboarding";
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

const PERSON = { fullName: "Jaylen Brooks", role: "Owner", phone: "", heardFrom: "Google search" };
const BUSINESS = { name: "DivineACQ", website: "", offer: "Growth systems for cleaning businesses", area: "United States", audience: "Cleaning company owners" };

async function walk(t: ReturnType<typeof convexTest>, subject: string) {
  const me = t.withIdentity(person(subject));
  await me.mutation(api.onboarding.save, { stage: "business", person: PERSON });
  await me.mutation(api.onboarding.save, { stage: "offer", business: BUSINESS });
  await me.mutation(api.onboarding.save, { stage: "goal", business: BUSINESS });
  await me.mutation(api.onboarding.save, { stage: "review", goal: { kind: "leads", text: "More booked jobs" } });
  return me;
}

describe("onboarding wizard", () => {
  it("starts a new person at the first step with their Clerk name", async () => {
    const t = convexTest(schema, modules);
    const me = t.withIdentity(person("new-1"));
    const view = await me.query(api.onboarding.mine, {});
    expect(view.stage).toBe("about");
    expect(view.wizardStep).toBe(0);
    expect(view.person.fullName).toBe("Jaylen Brooks");
  });

  it("treats someone already in a workspace as done", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.agents, {});
    const me = t.withIdentity(person("old-1"));
    await me.mutation(api.workspace.create, { name: "Existing" });
    expect((await me.query(api.onboarding.mine, {})).stage).toBe("done");
  });

  it("saves each step, refuses an unfinished wizard, then creates the workspace with profile and facts", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.agents, {});
    const me = t.withIdentity(person("new-2"));
    await me.mutation(api.onboarding.save, { stage: "business", person: PERSON });
    await expect(me.mutation(api.onboarding.finish, {})).rejects.toThrow(/business name/);

    await walk(t, "new-2");
    const before = await me.query(api.onboarding.mine, {});
    expect(before.stage).toBe("review");
    expect(before.wizardStep).toBe(4);

    const workspaceId = await me.mutation(api.onboarding.finish, {});
    const after = await me.query(api.onboarding.mine, {});
    expect(after.stage).toBe("freeSession");
    expect(after.workspaceId).toBe(workspaceId);
    // Finishing twice is harmless.
    expect(await me.mutation(api.onboarding.finish, {})).toBe(workspaceId);

    await t.run(async (ctx) => {
      const workspace = await ctx.db.get(workspaceId);
      expect(workspace?.name).toBe("DivineACQ");
      const profile = await ctx.db
        .query("profileVersions")
        .filter((q) => q.eq(q.field("workspaceId"), workspaceId))
        .collect();
      expect(profile).toHaveLength(1);
      expect(profile[0]).toMatchObject({ status: "confirmed", offer: BUSINESS.offer, geography: BUSINESS.area });
      const facts = await ctx.db
        .query("businessFacts")
        .filter((q) => q.eq(q.field("workspaceId"), workspaceId))
        .collect();
      const keys = facts.map((fact) => fact.factKey);
      expect(keys).toEqual(expect.arrayContaining(["businessName", "researchMarket", "researchGeography", "mainGoal", "ownerRole"]));
      const settings = await ctx.db
        .query("workspaceSettings")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .unique();
      expect(settings).toMatchObject({ setupDone: true, serviceTeamAccess: true });
    });

    await expect(me.mutation(api.onboarding.save, { stage: "goal", goal: { kind: "ads", text: "" } })).rejects.toThrow(/already saved/);
  });

  it("keeps service team access off when the owner says so, and staff grants respect it", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.agents, {});
    const me = await walk(t, "new-3");
    const workspaceId = await me.mutation(api.onboarding.finish, { serviceTeamAccess: false });
    await t.mutation(internal.staffAdmin.enroll, { userId: "staff-9", role: "service_team" });
    const staff = t.withIdentity(person("staff-9"));
    await expect(staff.mutation(api.staff.grant, { workspaceId, reason: "Helping with setup", hours: 4 })).rejects.toThrow(/turned off/);
  });

  it("reads the website and prefills only what the person left empty", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const me = t.withIdentity(person("new-4"));
    await me.mutation(api.onboarding.save, { stage: "business", person: PERSON });
    await me.mutation(api.onboarding.save, { stage: "offer", business: { ...BUSINESS, offer: "", area: "Chicago" } });
    await expect(me.mutation(api.onboarding.readSite, { url: "not a site" })).rejects.toThrow(/website address/);
    const url = await me.mutation(api.onboarding.readSite, { url: "divineacquisition.io/services" });
    expect(url).toBe("https://divineacquisition.io/");
    expect((await me.query(api.onboarding.mine, {})).site.status).toBe("reading");

    const rowId = await t.run(async (ctx) => (await ctx.db.query("onboarding").first())!._id);
    await t.mutation(internal.onboarding.saveSite, {
      rowId,
      url,
      ok: true,
      name: "Other Name",
      offer: "Growth systems",
      area: "Everywhere",
      audience: "Owners",
      summary: "A growth agency.",
      competitors: ["A", "B"],
      costCents: 3,
    });
    const view = await me.query(api.onboarding.mine, {});
    expect(view.site.status).toBe("read");
    expect(view.business).toMatchObject({ name: "DivineACQ", offer: "Growth systems", area: "Chicago", audience: "Cleaning company owners" });
    expect(view.site.competitors).toEqual(["A", "B"]);
    vi.useRealTimers();
  });
});

describe("siteDomains", () => {
  it("lists a bare host once, since the API refuses repeated domains", () => {
    expect(siteDomains("divineacquisition.io")).toEqual(["divineacquisition.io"]);
  });

  it("lists a www host and its bare form", () => {
    expect(siteDomains("www.example.com")).toEqual(["www.example.com", "example.com"]);
  });
});

async function finished(subject: string) {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.agents, {});
  const me = await walk(t, subject);
  const workspaceId = await me.mutation(api.onboarding.finish, {});
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
