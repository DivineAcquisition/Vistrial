/// <reference types="vite/client" />
/**
 * Holds the rules a review of the model switch found broken: a remembered choice is only ever written for
 * the person making the call, and the budget a person is shown is the budget the run gets.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import { estimateOn } from "./followups";
import { capsFor } from "./lib/modelChoice";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const AGENT = "growth-architect";
const ASTRA = "openai/gpt-6-astra";
type Tester = ReturnType<typeof convexTest>;

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

async function seed(t: Tester) {
  const owner = t.withIdentity(person("owner"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Northlight" });
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: AGENT, state: "on" });
  await t.run((ctx) => ctx.db.insert("members", { workspaceId, userId: "member", role: "member", displayName: "Member", active: true }));
  return { owner, member: t.withIdentity(person("member")), workspaceId };
}

const remembered = (t: Tester, userId: string) => t.run(async (ctx) => (await ctx.db.query("memberPreferences").collect()).find((row) => row.userId === userId)?.models ?? null);

describe("the model switch, after review", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.MODEL_FAMILIES = "gpt,gemini";
  });
  afterEach(() => {
    vi.useRealTimers();
    for (const key of ["OPENROUTER_API_KEY", "MODEL_FAMILIES", "OPENROUTER_WEB_SEARCH", "CLAUDE_HAIKU_WEB"]) delete process.env[key];
  });

  it("never lets one member change what is remembered for another, or the model of a conversation they did not start", async () => {
    const t = convexTest(schema, modules);
    const { owner, member, workspaceId } = await seed(t);
    const theirs = await owner.mutation(api.agentChat.send, { workspaceId, text: "Is my offer strong enough?" });
    const refused = "Only the person who started this conversation can change its model.";
    await expect(member.mutation(api.agentChat.setModel, { workspaceId, intakeId: theirs.intakeId, model: "claude-haiku-5-5" })).rejects.toThrow(refused);
    await expect(member.mutation(api.agentChat.send, { workspaceId, intakeId: theirs.intakeId, text: "A new patient check-up", model: ASTRA })).rejects.toThrow(refused);
    // Nothing was stored for either of them, and the conversation is as it was.
    expect(await remembered(t, "owner")).toBeNull();
    expect(await remembered(t, "member")).toBeNull();
    expect((await owner.query(api.agentChat.get, { workspaceId, intakeId: theirs.intakeId })).model).toBeNull();
    // Replying without picking a model is still allowed.
    await member.mutation(api.agentChat.send, { workspaceId, intakeId: theirs.intakeId, text: "A new patient check-up" });
    // The conversation's own person can change it, and it is remembered for them alone.
    await owner.mutation(api.agentChat.setModel, { workspaceId, intakeId: theirs.intakeId, model: "claude-sonnet-5-5" });
    expect(await remembered(t, "owner")).toEqual({ text: "claude-sonnet-5-5" });
    expect(await remembered(t, "member")).toBeNull();
  });

  it("draws the plan again when the model changes, and starts only on the budget shown", async () => {
    const t = convexTest(schema, modules);
    const { owner, member, workspaceId } = await seed(t);
    const chat = await owner.mutation(api.agentChat.send, { workspaceId, text: "Why am I not growing?" });
    await owner.mutation(api.agentChat.send, { workspaceId, intakeId: chat.intakeId, text: "10 more retained clients this quarter" });
    const plan = async () => (await owner.query(api.skillIntake.get, { workspaceId, intakeId: chat.intakeId })).messages.at(-1);
    expect(await plan()).toMatchObject({ kind: "plan", data: { capCents: 100 } });
    // A dearer model: the card on screen now shows the budget that model's run will get.
    await owner.mutation(api.agentChat.setModel, { workspaceId, intakeId: chat.intakeId, model: ASTRA });
    expect(await plan()).toMatchObject({ kind: "plan", data: { capCents: 250 } });
    // A card that shows any other budget than the run would get cannot be started from.
    const card = await t.run(async (ctx) => (await ctx.db.query("intakeMessages").collect()).find((row) => row.kind === "plan")!);
    await t.run((ctx) => ctx.db.patch(card._id, { data: { ...(card.data as object), capCents: 100 } }));
    await expect(owner.mutation(api.skillIntake.start, { workspaceId, intakeId: chat.intakeId })).rejects.toThrow("The budget changed");
    expect(await t.run((ctx) => ctx.db.query("agentRuns").collect())).toHaveLength(0);
    await t.run((ctx) => ctx.db.patch(card._id, { data: card.data }));
    // Another member pressing Start runs it on the conversation's model, and nothing is remembered for them.
    const started = await member.mutation(api.skillIntake.start, { workspaceId, intakeId: chat.intakeId });
    const run = await owner.query(api.runs.get, { workspaceId, runId: started.runId });
    expect(run.caps.maxCostCentsPerRun).toBe(250);
    expect(await remembered(t, "member")).toBeNull();
  });

  it("fixes a conversation with no pick to its person's remembered model when the plan is shown", async () => {
    const t = convexTest(schema, modules);
    const { owner, workspaceId } = await seed(t);
    // The owner's last choice for writing work is the dearer model.
    const earlier = await owner.mutation(api.agentChat.send, { workspaceId, text: "Is my offer strong enough?", model: ASTRA });
    expect(earlier.route).toBe("offer-intelligence");
    const chat = await owner.mutation(api.agentChat.send, { workspaceId, text: "Why am I not growing?" });
    await owner.mutation(api.agentChat.send, { workspaceId, intakeId: chat.intakeId, text: "10 more retained clients this quarter" });
    const view = await owner.query(api.skillIntake.get, { workspaceId, intakeId: chat.intakeId });
    expect(view.messages.at(-1)).toMatchObject({ kind: "plan", data: { capCents: 250 } });
    expect((await owner.query(api.agentChat.get, { workspaceId, intakeId: chat.intakeId })).model).toBe(ASTRA);
  });

  it("raises caps only for a model that will really run the work", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId } = await seed(t);
    const cap = (skillSlug: string, choice: string | undefined, mode?: string) => t.run(async (ctx) => (await capsFor(ctx, { workspaceId, agentSlug: AGENT, skillSlug, choice, mode })).maxCostCentsPerRun);
    expect(await cap("growth-diagnostics", undefined)).toBe(100);
    expect(await cap("growth-diagnostics", ASTRA)).toBe(250);
    // Research searches the web. Until that is proven through OpenRouter the model is set aside, the
    // platform's route runs, and nothing is raised.
    expect(await cap("market-intelligence", ASTRA)).toBe(300);
    process.env.OPENROUTER_WEB_SEARCH = "on";
    expect(await cap("market-intelligence", ASTRA)).toBe(750);
    // Fast work runs on the lighter companion, which costs no more than the platform's model.
    expect(await cap("market-intelligence", ASTRA, "fast")).toBe(150);
    // The family is switched off: the stored choice raises nothing.
    process.env.MODEL_FAMILIES = "gemini";
    expect(await cap("growth-diagnostics", ASTRA)).toBe(100);
    expect(await cap("market-intelligence", ASTRA)).toBe(300);
  });

  it("scales a follow-up's research estimate by the model that will search", () => {
    expect(estimateOn(90, undefined, "thorough")).toBe(90);
    // Web search through OpenRouter is not proven: the model is set aside and the estimate is unchanged.
    expect(estimateOn(90, ASTRA, "thorough")).toBe(90);
    process.env.OPENROUTER_WEB_SEARCH = "on";
    expect(estimateOn(90, ASTRA, "thorough")).toBe(225);
    expect(estimateOn(30, ASTRA, "thorough")).toBe(75);
    expect(estimateOn(40, ASTRA, "fast")).toBe(40);
    expect(estimateOn(90, "openai/gpt-6.1-sol", "thorough")).toBe(90);
  });
});
