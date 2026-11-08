/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

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
