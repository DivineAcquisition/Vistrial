/**
 * @vitest-environment edge-runtime
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { applyUpdate, emptySlots, nextMissing, prefill, saysUnknown } from "./lib/intake";
import type { ScriptedModel } from "./lib/toolRouter";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;

const identity = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });

async function settle(t: Tester) {
  for (let i = 0; i < 4; i += 1) {
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
  }
}

async function setup(t: Tester, withModel: boolean) {
  const workspaceId = await t.mutation(internal.reviewer.setUpReviewerWorkspace, { userId: "user_owner" });
  if (withModel) {
    await t.run(async (ctx) => {
      await ctx.db.insert("modelRoutes", { workKind: "classify", provider: "fake", model: "fake-scripted", fallbackProvider: "fake", fallbackModel: "fake-scripted" });
    });
  }
  return { workspaceId, owner: t.withIdentity(identity("user_owner")) };
}

describe("intake checklist (code)", () => {
  it("fills from memory, then asks only what is missing, in order", () => {
    const slots = prefill(emptySlots(), { offer: "Deep cleaning", geography: "Austin, TX", competitors: [{ name: "Molly Maid" }] });
    expect(slots.origins).toMatchObject({ market: "memory", geography: "memory", competitors: "memory" });
    expect(nextMissing(slots)).toBe("objective");
    expect(nextMissing({ ...slots, objective: "What do they lead with?" })).toBeNull();
    expect(nextMissing({ ...emptySlots(), objective: "x" })).toBe("market");
  });

  it("learned audience channels narrow where to look; otherwise it looks everywhere", () => {
    expect(emptySlots().platforms).toEqual(["web", "youtube", "tiktok", "instagram", "metaAdLibrary"]);
    expect(prefill(emptySlots(), { audienceChannels: "youtube, web" }).platforms).toEqual(["web", "youtube"]);
  });

  it("takes only what the answer states, keeps competitors unique, and marks the owner as the origin", () => {
    const start = prefill(emptySlots(), { geography: "Austin, TX", competitors: [{ name: "Molly Maid" }] });
    const { slots, changed } = applyUpdate(start, { objective: "Pricing", market: "", competitors: [{ name: "molly maid" }, { name: "Sparkle", url: "sparkle.com" }] });
    expect(changed).toEqual(["objective", "competitors"]);
    expect(slots.geography).toBe("Austin, TX");
    expect(slots.competitors.map((row) => [row.name, row.url ?? null, row.origin])).toEqual([
      ["Molly Maid", null, "memory"],
      ["Sparkle", "https://sparkle.com/", "you"],
    ]);
    expect(saysUnknown("I'm not sure, find them")).toBe(true);
    expect(saysUnknown("Molly Maid and Sparkle")).toBe(false);
  });
});

describe("intake conversation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel;
  });

  it("without a model, the guided questions carry it to a plan", async () => {
    const t = makeTester();
    const { workspaceId, owner } = await setup(t, false);
    const intakeId = await owner.mutation(api.intake.create, { workspaceId, agentSlug: "growth-architect", text: "What do London cleaners lead with?" });
    await settle(t);
    let view = await owner.query(api.intake.get, { workspaceId, intakeId });
    // Memory filled what you sell and the area (London profile); the goal came from the first message.
    expect(view.intake.slots).toMatchObject({ objective: "What do London cleaners lead with?", geography: "London, UK" });
    expect(view.messages.map((row) => row.kind)).toEqual(["text", "known", "question"]);
    expect(view.intake.asking).toBe("competitors");
    expect(view.messages.at(-1)?.chips).toContain("I'm not sure, find them");

    await owner.mutation(api.intake.reply, { workspaceId, intakeId, text: "I'm not sure, find them" });
    await settle(t);
    view = await owner.query(api.intake.get, { workspaceId, intakeId });
    expect(view.intake.status).toBe("ready");
    const plan = view.messages.at(-1)!;
    expect(plan.kind).toBe("plan");
    expect((plan.data as { assumptions: string[] }).assumptions.join(" ")).toContain("looks at the market broadly");
    expect(view.intake.costCents).toBe(0);
  });

  it("with Claude: reads the answer, offers to remember it, and asks the next missing thing", async () => {
    const t = makeTester();
    const { workspaceId, owner } = await setup(t, true);
    await t.run(async (ctx) => {
      const profile = await ctx.db.query("profileVersions").first();
      if (profile) await ctx.db.patch(profile._id, { geography: "" });
    });
    const inputs: string[] = [];
    (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel = (params) => {
      const input = String(params.messages[0].content);
      inputs.push(input);
      const said = input.split("UNTRUSTED CONTENT\n")[1] ?? "";
      const area = /Leeds/.test(said) ? "Leeds, UK" : "";
      return {
        text: JSON.stringify({
          update: { objective: /lead with/.test(said) ? "What competitors lead with" : "", market: "", geography: area, competitors: [], competitorsUnknown: false, links: [] },
          reply: area ? "Leeds it is." : "Got it.",
          question: area ? { slot: "competitors", text: "Who do you lose jobs to most?", chips: ["Molly Maid"] } : { slot: "geography", text: "Which city or area?", chips: ["Leeds", "London"] },
          platformNote: "For home cleaning, Facebook and Instagram ads and Google reviews matter most; I'll still look everywhere.",
        }),
      };
    };
    const intakeId = await owner.mutation(api.intake.create, { workspaceId, agentSlug: "growth-architect", text: "What do competitors lead with?" });
    await settle(t);
    let view = await owner.query(api.intake.get, { workspaceId, intakeId });
    expect(view.messages.at(-1)).toMatchObject({ kind: "question", text: "Which city or area?", chips: ["Leeds", "London"] });

    await owner.mutation(api.intake.reply, { workspaceId, intakeId, text: "Leeds" });
    await settle(t);
    view = await owner.query(api.intake.get, { workspaceId, intakeId });
    expect(view.intake.slots.geography).toBe("Leeds, UK");
    expect(view.messages.map((row) => row.kind).slice(-3)).toEqual(["text", "remember", "question"]);
    expect(view.messages.at(-1)?.chips).toEqual(["Molly Maid", "I'm not sure, find them"]);
    expect(view.intake.pendingRemember).toEqual([{ factKey: "researchGeography", label: "your area", value: "Leeds, UK" }]);
    // The owner's words reach Claude only inside the untrusted block.
    expect(inputs.at(-1)).toMatch(/Latest message from the owner:\nUNTRUSTED CONTENT\nLeeds$/);
    expect(view.intake.costCents).toBeGreaterThan(0);

    await owner.mutation(api.intake.remember, { workspaceId, intakeId, factKey: "researchGeography", yes: true });
    const facts = await owner.query(api.facts.list, { workspaceId });
    expect(facts.find((row) => row.factKey === "researchGeography")).toMatchObject({ value: "Leeds, UK", status: "verified", sourceType: "owner" });
  });

  it("stops asking after five questions and plans with what it has", async () => {
    const t = makeTester();
    const { workspaceId, owner } = await setup(t, false);
    await t.run(async (ctx) => {
      const profile = await ctx.db.query("profileVersions").first();
      if (profile) await ctx.db.patch(profile._id, { geography: "", offer: "" });
    });
    const intakeId = await owner.mutation(api.intake.create, { workspaceId, agentSlug: "growth-architect", text: "Pricing" });
    await settle(t);
    for (let i = 0; i < 6; i += 1) {
      const view = await owner.query(api.intake.get, { workspaceId, intakeId });
      if (view.intake.status === "ready") break;
      // Empty-ish answers never fill a slot, so only the cap ends it.
      await owner.mutation(api.intake.reply, { workspaceId, intakeId, text: "." });
      await t.run(async (ctx) => {
        const row = await ctx.db.get(intakeId as Id<"intakes">);
        if (row) await ctx.db.patch(row._id, { slots: { ...row.slots, market: "", geography: "" } });
      });
      await settle(t);
    }
    const view = await owner.query(api.intake.get, { workspaceId, intakeId });
    expect(view.intake.questionsAsked).toBeLessThanOrEqual(5);
    expect(view.intake.status).toBe("ready");
  });

  it("keeps each workspace's intake to itself, and a Viewer cannot start one", async () => {
    const t = makeTester();
    const { workspaceId, owner } = await setup(t, false);
    await t.run(async (ctx) => {
      await ctx.db.insert("members", { workspaceId, userId: "user_viewer", role: "viewer", displayName: "Viewer", active: true });
      const other = await ctx.db.insert("workspaces", { name: "Other", slug: "other", timezone: "UTC", status: "active", createdAt: 0 });
      await ctx.db.insert("members", { workspaceId: other, userId: "user_other", role: "owner", displayName: "Other", active: true });
    });
    const intakeId = await owner.mutation(api.intake.create, { workspaceId, agentSlug: "growth-architect", text: "Pricing" });
    await expect(t.withIdentity(identity("user_other")).query(api.intake.get, { workspaceId, intakeId })).rejects.toThrow();
    await expect(t.withIdentity(identity("user_viewer")).mutation(api.intake.create, { workspaceId, agentSlug: "growth-architect", text: "x" })).rejects.toThrow();
  });
});
