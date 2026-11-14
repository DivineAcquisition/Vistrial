/**
 * @vitest-environment edge-runtime
 *
 * Dealmaker's chat (build step 18b): routed in code; simple questions answered from the CRM with no model
 * call; work planned and priced before anything runs, asking which call first where it needs one; Start goes
 * through the work's own start; a chat is its writer's own.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import { DM_QUESTION, NOTHING_RUNS, dmRoute } from "./lib/dealmaker/chat";
import { CHAT_TEXT } from "./dealmakerChat";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const person = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });
const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 14, 15);

describe("the router", () => {
  it("answers questions in code, routes work, and asks when it cannot tell", () => {
    expect(dmRoute("How many open deals do I have?")).toEqual({ kind: "question", question: "openDeals" });
    expect(dmRoute("what's my show rate")).toEqual({ kind: "question", question: "showRate" });
    expect(dmRoute("Who needs a follow up today?")).toEqual({ kind: "question", question: "moves" });
    expect(dmRoute("Review my pipeline please")).toEqual({ kind: "work", skill: "pipeline-forensics" });
    expect(dmRoute("Prep me for my call with Jordan")).toEqual({ kind: "work", skill: "deal-briefing" });
    expect(dmRoute("How did my last call go?")).toEqual({ kind: "work", skill: "conversation-intelligence" });
    expect(dmRoute("Draft follow-ups for my quiet deals")).toEqual({ kind: "work", skill: "follow-up-engine" });
    expect(dmRoute("Draft my follow-ups")).toEqual({ kind: "work", skill: "follow-up-engine" });
    expect(dmRoute("hello")).toEqual({ kind: "unclear" });
  });
});

describe("Dealmaker's chat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function setup() {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(person("nora"));
    const workspaceId = await owner.mutation(api.workspace.create, { name: "Northlight" });
    await t.run(async (ctx) => {
      const agent = (await ctx.db
        .query("agents")
        .withIndex("by_slug", (q) => q.eq("slug", "sales-conversion"))
        .unique())!;
      await ctx.db.patch(agent._id, { status: "live" });
    });
    await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: "sales-conversion", state: "on" });
    const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: "milo@example.com", role: "member" });
    const member = t.withIdentity(person("milo"));
    await member.mutation(api.workspace.acceptInvite, { token: invite.token });
    return { t, owner, member, workspaceId };
  }

  async function connect(s: Awaited<ReturnType<typeof setup>>) {
    await s.t.run(async (ctx) => {
      const connectionId = await ctx.db.insert("crmConnections", {
        workspaceId: s.workspaceId,
        provider: "highlevel",
        status: "connected",
        accessToken: "token",
        refreshToken: "refresh",
        tokenExpiresAt: NOW + DAY,
        scopes: [],
        accountId: "loc1",
        accountName: "Northlight",
        currency: "USD",
        timezone: "America/New_York",
        connectedBy: "nora",
        connectedAt: NOW - 30 * DAY,
        lastSyncAt: NOW,
        callsOk: 0,
        callsFailed: 0,
      });
      const base = { workspaceId: s.workspaceId, connectionId, seenAt: NOW };
      await ctx.db.insert("crmPipelines", { ...base, externalId: "p1", name: "Sales", stages: [{ id: "s1", name: "Booked", position: 0 }] });
      await ctx.db.insert("crmDeals", {
        ...base,
        externalId: "d1",
        pipelineId: "p1",
        stageId: "s1",
        status: "open",
        value: 3000,
        contactId: "c1",
        createdAt: NOW - 2 * DAY,
        lastStageChangeAt: NOW - 2 * DAY,
      });
      await ctx.db.insert("crmDeals", {
        ...base,
        externalId: "d2",
        pipelineId: "p1",
        stageId: "s1",
        status: "open",
        value: 4500,
        contactId: "c2",
        createdAt: NOW - 2 * DAY,
        lastStageChangeAt: NOW - 2 * DAY,
      });
      await ctx.db.insert("crmContacts", { ...base, externalId: "c1", name: "Jordan Lee", tags: [], addedAt: NOW - 2 * DAY });
      await ctx.db.insert("crmContacts", { ...base, externalId: "c2", name: "Sam Ray", tags: [], addedAt: NOW - 2 * DAY });
      await ctx.db.insert("crmActivities", { workspaceId: s.workspaceId, connectionId, externalId: "a1", kind: "appointment", at: NOW + 5 * HOUR, contactId: "c1", status: "booked" });
    });
  }

  it("answers a question in code, and says how without a CRM", async () => {
    const s = await setup();
    const first = await s.owner.mutation(api.dealmakerChat.send, { workspaceId: s.workspaceId, text: "How many open deals do I have?" });
    expect((await s.owner.query(api.dealmakerChat.get, { workspaceId: s.workspaceId, chatId: first })).messages.at(-1)!.text).toBe(CHAT_TEXT.noCrm);
    await connect(s);
    const chatId = await s.owner.mutation(api.dealmakerChat.send, { workspaceId: s.workspaceId, chatId: first, text: "How many open deals are in my pipeline?" });
    const chat = await s.owner.query(api.dealmakerChat.get, { workspaceId: s.workspaceId, chatId });
    expect(chat.messages.at(-1)!.text).toMatch(/^2 open deals worth \$7,500: 2 active, 0 cooling, 0 quiet\./);
    expect(chat.plan).toBeNull();
    // A chat is its writer's own.
    await expect(s.member.query(api.dealmakerChat.get, { workspaceId: s.workspaceId, chatId })).rejects.toThrow();
  });

  it("asks which work when it cannot tell, then plans and prices it, and starts it through the work's own start", async () => {
    const s = await setup();
    await connect(s);
    const chatId = await s.owner.mutation(api.dealmakerChat.send, { workspaceId: s.workspaceId, text: "hello" });
    let chat = await s.owner.query(api.dealmakerChat.get, { workspaceId: s.workspaceId, chatId });
    expect(chat.messages.at(-1)).toMatchObject({ text: DM_QUESTION });
    expect(chat.messages.at(-1)!.choices.map((row) => row.label)).toEqual(["Review my pipeline", "Prepare me for a call", "Review a call", "Draft my follow-ups"]);

    await s.owner.mutation(api.dealmakerChat.send, { workspaceId: s.workspaceId, chatId, text: "Draft my follow-ups" });
    chat = await s.owner.query(api.dealmakerChat.get, { workspaceId: s.workspaceId, chatId });
    expect(chat.plan).toMatchObject({ skill: "follow-up-engine", result: { tab: "comms" } });
    expect(chat.messages.at(-1)!.text).toContain(NOTHING_RUNS);
    expect(await s.t.run((ctx) => ctx.db.query("agentRuns").collect())).toHaveLength(0);

    const { runId } = await s.owner.mutation(api.dealFollowUps.draft, { workspaceId: s.workspaceId, confirmedCredits: chat.plan!.maxCredits });
    await s.owner.mutation(api.dealmakerChat.started, { workspaceId: s.workspaceId, chatId, runId });
    chat = await s.owner.query(api.dealmakerChat.get, { workspaceId: s.workspaceId, chatId });
    expect(chat.plan).toBeNull();
    expect(chat.messages.at(-1)!.text).toBe("Started. The drafts appear in Comms when they are ready.");
    expect((await s.owner.query(api.dealmakerChat.list, { workspaceId: s.workspaceId })).map((row) => row.title)).toEqual(["hello"]);
  });

  it("asks which call before planning a brief, and starts a pipeline review only at the confirmed budget", async () => {
    const s = await setup();
    await connect(s);
    const chatId = await s.owner.mutation(api.dealmakerChat.send, { workspaceId: s.workspaceId, text: "Prep me for my call" });
    let chat = await s.owner.query(api.dealmakerChat.get, { workspaceId: s.workspaceId, chatId });
    expect(chat.messages.at(-1)!.text).toBe(CHAT_TEXT.pickCall);
    const call = chat.messages.at(-1)!.choices[0];
    expect(call).toMatchObject({ value: "call:a1" });
    expect(call.label).toMatch(/^Jordan Lee, Sat/);
    await s.owner.mutation(api.dealmakerChat.send, { workspaceId: s.workspaceId, chatId, text: call.value });
    chat = await s.owner.query(api.dealmakerChat.get, { workspaceId: s.workspaceId, chatId });
    expect(chat.messages.at(-2)!.text).toBe(call.label);
    expect(chat.plan).toMatchObject({ skill: "deal-briefing", target: { kind: "call", ref: "a1", contactRef: "c1" } });

    const review = await s.owner.mutation(api.dealmakerChat.send, { workspaceId: s.workspaceId, text: "Review my pipeline" });
    const plan = (await s.owner.query(api.dealmakerChat.get, { workspaceId: s.workspaceId, chatId: review })).plan!;
    await expect(s.owner.mutation(api.dealmakerChat.startPipelineReview, { workspaceId: s.workspaceId, confirmedCredits: plan.maxCredits + 1 })).rejects.toThrow(CHAT_TEXT.budgetMoved);
    const { runId } = await s.owner.mutation(api.dealmakerChat.startPipelineReview, { workspaceId: s.workspaceId, confirmedCredits: plan.maxCredits });
    expect(await s.t.run(async (ctx) => (await ctx.db.get(runId))?.skillSlug)).toBe("pipeline-forensics");
  });
});
