/**
 * @vitest-environment edge-runtime
 *
 * The Objection Playbook's talk tracks (Dealmaker; docs/rebuild/dealmaker.md, 0.8 and 4.5): the checks in code
 * (no price beyond the offer, no promised result, every figure from the offer item named), a whole run with a
 * scripted model that waits for a person's review, the five-call minimum, and the Owner's weekly switch.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ScriptedModel } from "./lib/toolRouter";
import { runChecks } from "./skills/objectionPlaybook/checks";
import { computeTracks } from "./skills/objectionPlaybook/compute";
import type { Tracks } from "./skills/objectionPlaybook/shapes";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = Date.UTC(2026, 10, 14, 15);
const AGENT = "sales-conversion";

const record = computeTracks({
  playbookId: "x",
  projectId: "p",
  calls: 6,
  rows: [
    { itemId: "money", title: "It costs more than I expected", tag: "money", heard: 4, quotes: [{ quote: "more than we set aside", at: 1, leadName: null }], worked: [{ answerQuote: "one extra client a month covers it", at: 1 }], workedWords: "Answered on 3 calls: 2 later won." },
    { itemId: "partner", title: "I need to talk to my partner first", tag: "trust", heard: 2, quotes: [], worked: [], workedWords: "" },
    { itemId: "quiet", title: "Not the right time", tag: "time", heard: 0, quotes: [], worked: [], workedWords: "" },
  ],
  items: [
    { id: "pkg", folder: "offer", kind: "package", title: "Growth Sprint", body: "Twelve weeks, $4,500 a month." },
    { id: "proof", folder: "offer", kind: "proof", title: "Harbor Dental: 41 booked consultations in 60 days", body: "" },
    { id: "voice", folder: "closing", kind: "voice", title: "Plain and warm", body: "Signed Nora." },
  ],
  lessons: ["Never discount on the first call."],
});

function good(): Tracks {
  return {
    tracks: [
      { objectionId: "o1", track: "That's fair. Harbor Dental booked 41 consultations in 60 days, so the question is whether one extra client a month covers the $4,500.", offerIds: ["f1", "f2"] },
      { objectionId: "o2", track: "Of course. Would it help if I sent a one-page summary you can go through together, and we pick a time for the three of us?", offerIds: [] },
    ],
  };
}

describe("talk-track checks (code)", () => {
  it("reads the objections heard, most heard first, and the offer with proof first", () => {
    expect(record.objections.map((row) => [row.id, row.itemId, row.heard])).toEqual([
      ["o1", "money", 4],
      ["o2", "partner", 2],
    ]);
    expect(record.offer.map((row) => [row.id, row.kind])).toEqual([
      ["f1", "proof"],
      ["f2", "package"],
    ]);
    expect(record.voice).toBe("Plain and warm. Signed Nora.");
  });

  it("passes tracks grounded in the offer", () => {
    expect(runChecks(good(), record)).toMatchObject({ passed: true });
  });

  it("fails a stray, a missing track, an unknown offer item, a new price, a promise, an ungrounded figure, pressure and length", () => {
    const fail = (draft: Tracks) => runChecks(draft, record).results.filter((row) => !row.passed).map((row) => row.id);
    const [one, two] = good().tracks;
    expect(fail({ tracks: [one, two, { objectionId: "o9", track: "Hi.", offerIds: [] }] })).toEqual([1]);
    expect(fail({ tracks: [one] })).toEqual([2]);
    expect(fail({ tracks: [{ ...one, offerIds: ["f1", "f2", "f7"] }, two] })).toEqual([3]);
    expect(fail({ tracks: [{ ...one, track: "We could do $3,000 a month this time." }, two] })).toEqual([4]);
    expect(fail({ tracks: [{ ...one, track: "This will double your booked calls." }, two] })).toEqual([5]);
    // The proof's figure needs the proof named.
    expect(fail({ tracks: [{ ...one, offerIds: ["f2"] }, two] })).toEqual([5]);
    expect(fail({ tracks: [one, { ...two, track: "Only 2 spots left, so act now." }] })).toEqual([5, 6]);
    expect(fail({ tracks: [one, { ...two, track: Array.from({ length: 95 }, () => "word").join(" ") }] })).toEqual([7]);
    expect(runChecks(null, record).passed).toBe(false);
  });
});

// ---------- Whole runs ----------

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

function script(answer: (revise: boolean) => unknown) {
  const inputs: string[] = [];
  (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel = (params) => {
    const text = String(params.messages[0].content);
    inputs.push(text);
    const revise = text.startsWith("Revise the talk tracks");
    if (!revise && !text.startsWith("Write a talk track")) throw new Error(`unscripted call: ${text.slice(0, 40)}`);
    return { text: JSON.stringify(answer(revise)) };
  };
  return inputs;
}

async function setup(calls = 5) {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity(person("dana"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Northpeak" });
  const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: "milo@example.com", role: "admin" });
  const admin = t.withIdentity(person("milo"));
  await admin.mutation(api.workspace.acceptInvite, { token: invite.token });
  await t.run(async (ctx) => {
    const agent = (await ctx.db.query("agents").withIndex("by_slug", (q) => q.eq("slug", AGENT)).unique())!;
    await ctx.db.patch(agent._id, { status: "live" });
    for (const workKind of ["classify", "research", "write", "summarize"]) {
      const row = await ctx.db.query("modelRoutes").withIndex("by_workKind", (q) => q.eq("workKind", workKind)).unique();
      if (!row) await ctx.db.insert("modelRoutes", { workKind, provider: "fake", model: "fake-scripted", fallbackProvider: "fake", fallbackModel: "fake-scripted" });
    }
  });
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: AGENT, state: "on" });
  const ids = await t.run(async (ctx) => {
    const base = { workspaceId, source: { type: "person" as const }, basis: "firstParty" as const, status: "active" as const, createdBy: "dana", createdAt: 1, updatedAt: 1 };
    const money = await ctx.db.insert("playbookItems", { ...base, folder: "objections", kind: "objection", tag: "money", title: "It costs more than I expected", body: "" });
    const partner = await ctx.db.insert("playbookItems", { ...base, folder: "objections", kind: "objection", tag: "trust", title: "I need to talk to my partner first", body: "" });
    await ctx.db.insert("playbookItems", { ...base, folder: "offer", kind: "proof", title: "Harbor Dental: 41 booked consultations in 60 days", body: "" });
    await ctx.db.insert("playbookItems", { ...base, folder: "offer", kind: "package", title: "Growth Sprint", body: "Twelve weeks, $4,500 a month." });
    for (let i = 0; i < calls; i += 1) {
      await ctx.db.insert("callNotes", { workspaceId, leadName: `Lead ${i}`, outcome: i % 2 ? "yes" : "thinking", fit: [], objections: [{ title: "", itemId: money }, ...(i < 2 ? [{ title: "", itemId: partner }] : [])], writtenBy: "Milo", createdBy: "milo", createdAt: NOW - i * 1000 });
    }
    return { money, partner };
  });
  return { t, owner, admin, workspaceId, ...ids };
}

async function finish(s: Awaited<ReturnType<typeof setup>>, runId: Id<"agentRuns">) {
  let status = "queued";
  for (let i = 0; i < 30 && (status === "queued" || status === "running"); i += 1) {
    vi.advanceTimersByTime(1);
    await s.t.finishInProgressScheduledFunctions();
    status = (await s.owner.query(api.runs.get, { workspaceId: s.workspaceId, runId })).status as string;
  }
  return status;
}

describe("talk tracks, run end to end", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel;
  });

  it("needs five calls before it writes anything", async () => {
    const s = await setup(4);
    const { maxCredits } = await s.owner.query(api.objectionPlaybook.quote, { workspaceId: s.workspaceId });
    await expect(s.owner.mutation(api.objectionPlaybook.request, { workspaceId: s.workspaceId, confirmedCredits: maxCredits })).rejects.toThrow(/at least 5 calls.*You have 4/);
    const view = await s.owner.query(api.objectionPlaybook.view, { workspaceId: s.workspaceId });
    expect(view).toMatchObject({ canAskTracks: false, tracksBlocked: "Talk tracks need at least 5 calls reviewed or noted. You have 4.", tracksState: null });
    expect(await s.t.run((ctx) => ctx.db.query("researchProjects").collect())).toEqual([]);
  });

  it("writes a talk track per objection heard, from the offer, and waits for a person's review before it reads as approved", async () => {
    const inputs = script(() => good());
    const s = await setup();
    const { maxCredits } = await s.owner.query(api.objectionPlaybook.quote, { workspaceId: s.workspaceId });
    await expect(s.owner.mutation(api.objectionPlaybook.request, { workspaceId: s.workspaceId, confirmedCredits: maxCredits + 1 })).rejects.toThrow(/budget changed/);
    const { runId } = await s.owner.mutation(api.objectionPlaybook.request, { workspaceId: s.workspaceId, confirmedCredits: maxCredits });
    expect(await finish(s, runId)).toBe("completed");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toContain("UNTRUSTED CONTENT");
    expect(inputs[0]).not.toContain("Lead 0");
    expect(inputs[0]).not.toContain(s.money);

    const view = await s.owner.query(api.objectionPlaybook.view, { workspaceId: s.workspaceId });
    expect(view.tracksState).toBe("ready");
    const money = view.rows.find((row) => row.itemId === s.money)!;
    expect(money.track).toEqual({ text: good().tracks[0].track, offer: ["Harbor Dental: 41 booked consultations in 60 days", "Growth Sprint"], approved: false });
    // The asset waits in the approvals queue: talk tracks are not internal work.
    const assets = await s.t.run((ctx) => ctx.db.query("assets").collect());
    expect(assets.map((row) => [row.kind, row.status])).toEqual([["objectionPlaybook", "draft"]]);
    expect((await s.t.run((ctx) => ctx.db.query("approvals").collect())).length).toBe(1);
    const evidence = await s.t.run((ctx) => ctx.db.query("evidence").collect());
    expect(evidence.filter((row) => row.claimKey.startsWith("track-")).every((row) => row.basis === "hypothesis")).toBe(true);
    expect(evidence.filter((row) => row.claimKey.startsWith("heard-")).every((row) => row.basis === "firstParty" && row.computed)).toBe(true);

    await s.t.run((ctx) => ctx.db.patch(assets[0]._id, { status: "approved" }));
    expect((await s.owner.query(api.objectionPlaybook.view, { workspaceId: s.workspaceId })).rows.find((row) => row.itemId === s.money)!.track?.approved).toBe(true);
  });

  it("revises once, and shows nothing that still fails", async () => {
    script(() => ({ tracks: [{ objectionId: "o1", track: "This will double your bookings.", offerIds: [] }] }));
    const s = await setup();
    const { maxCredits } = await s.owner.query(api.objectionPlaybook.quote, { workspaceId: s.workspaceId });
    const { runId } = await s.owner.mutation(api.objectionPlaybook.request, { workspaceId: s.workspaceId, confirmedCredits: maxCredits });
    expect(await finish(s, runId)).toBe("completed");
    const view = await s.owner.query(api.objectionPlaybook.view, { workspaceId: s.workspaceId });
    expect(view.tracksState).toBe("needsReview");
    expect(view.rows.every((row) => row.track === null)).toBe(true);
    expect((await s.t.run((ctx) => ctx.db.query("assets").collect()))[0]).toMatchObject({ status: "needsReview", currentVersion: 2 });
  });

  it("runs weekly only where the Owner turned it on, once a week", async () => {
    script(() => good());
    const s = await setup();
    await expect(s.admin.mutation(api.objectionPlaybook.setWeekly, { workspaceId: s.workspaceId, on: true })).rejects.toThrow(/Only an Owner/);
    await s.t.mutation(internal.objectionPlaybook.weekly, {});
    expect(await s.t.run((ctx) => ctx.db.query("objectionRuns").collect())).toEqual([]);
    await s.owner.mutation(api.objectionPlaybook.setWeekly, { workspaceId: s.workspaceId, on: true });
    expect((await s.owner.query(api.objectionPlaybook.view, { workspaceId: s.workspaceId })).weekly).toEqual({ on: true, canChange: true });
    await s.t.mutation(internal.objectionPlaybook.weekly, {});
    const runs = await s.t.run((ctx) => ctx.db.query("objectionRuns").collect());
    expect(runs.map((row) => [row.trigger, row.week])).toEqual([["weekly", "2026-W46"]]);
    expect(await finish(s, runs[0].runId!)).toBe("completed");
    await s.t.mutation(internal.objectionPlaybook.weekly, {});
    expect(await s.t.run((ctx) => ctx.db.query("objectionRuns").collect())).toHaveLength(1);
  });
});
