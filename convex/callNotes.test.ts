/**
 * @vitest-environment edge-runtime
 *
 * Call notes (Dealmaker, build step 11): the closer's own account after a call reaches the Pipeline as rep's
 * facts and a commitment they own; objections come from the Playbook or a few words; a voice memo is
 * transcribed by Deepgram and its audio deleted; and nothing is saved for a lead Vistrial did not read.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { transcriptOf } from "./callNotes";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 14, 15);

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

async function setup(options: { crm?: boolean } = {}) {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity(person("dana"));
  const workspaceId = await owner.mutation(api.workspace.create, { name: "Northpeak" });
  const objectionId = await t.run(async (ctx) => {
    if (options.crm !== false) {
      const connectionId = await ctx.db.insert("crmConnections", { workspaceId, provider: "highlevel", status: "connected", accessToken: "t", refreshToken: "r", tokenExpiresAt: NOW + DAY, scopes: [], accountId: "loc1", accountName: "Aster Coaching", currency: "USD", connectedBy: "dana", connectedAt: NOW - DAY, callsOk: 0, callsFailed: 0 });
      const base = { workspaceId, connectionId, seenAt: NOW };
      await ctx.db.insert("crmContacts", { ...base, externalId: "c1", name: "Jordan Lee", tags: [] });
      await ctx.db.insert("crmContacts", { ...base, externalId: "c2", name: "Riley Park", tags: [] });
      await ctx.db.insert("crmDeals", { ...base, externalId: "d1", pipelineId: "p1", stageId: "s1", status: "open", value: 4500, contactId: "c1" });
    }
    return ctx.db.insert("playbookItems", { workspaceId, folder: "objections", kind: "objection", tag: "money", title: "Too expensive right now", body: "", source: { type: "starter" }, basis: "hypothesis", status: "active", createdBy: "agent", createdAt: 1, updatedAt: 1 });
  });
  return { t, owner, workspaceId, objectionId };
}

const base = { outcome: "proposal" as const, fit: [], objections: [] };

describe("call notes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("files the closer's account as rep's facts and a commitment they own, never as the buyer's words", async () => {
    const s = await setup();
    const callNoteId = await s.owner.mutation(api.callNotes.save, {
      workspaceId: s.workspaceId,
      ...base,
      contactRef: "c1",
      dealRef: "d1",
      nextStep: "Send the proposal",
      nextStepDue: NOW + 2 * DAY,
      fit: [
        { field: "budget", value: "About $3k a month" },
        { field: "decider", value: "Her business partner" },
        { field: "timing", value: "  " },
      ],
      objections: [{ title: "", itemId: s.objectionId }, { title: "Wants a case study first" }],
    });
    const facts = await s.t.run((ctx) => ctx.db.query("dealFacts").collect());
    expect(facts.map((row) => [row.field, row.value, row.kind, row.author, row.sourceRef])).toEqual([
      ["budget", "About $3k a month", "rep", "dana", `callNote:${callNoteId}`],
      ["decider", "Her business partner", "rep", "dana", `callNote:${callNoteId}`],
    ]);
    const commitments = await s.t.run((ctx) => ctx.db.query("dealCommitments").collect());
    expect(commitments).toHaveLength(1);
    expect(commitments[0]).toMatchObject({ dealRef: "d1", text: "Send the proposal", due: NOW + 2 * DAY });
    const recent = await s.owner.query(api.callNotes.recent, { workspaceId: s.workspaceId });
    expect(recent.notes[0]).toMatchObject({ leadName: "Jordan Lee", outcomeWords: "Asked for a proposal", objections: ["Too expensive right now", "Wants a case study first"], memo: null });
    expect(recent.objections.map((row) => row.title)).toEqual(["Too expensive right now"]);
    // Nothing in the CRM changed and nobody was contacted.
    expect(await s.t.run((ctx) => ctx.db.query("crmActions").collect())).toEqual([]);
  });

  it("refuses a lead Vistrial did not read, another lead's deal, an unknown objection and a Viewer", async () => {
    const s = await setup();
    const save = (args: Record<string, unknown>) => s.owner.mutation(api.callNotes.save, { workspaceId: s.workspaceId, ...base, ...args });
    await expect(save({})).rejects.toThrow("Pick the lead from your CRM.");
    await expect(save({ contactRef: "nobody" })).rejects.toThrow(/has not read that lead/);
    await expect(save({ contactRef: "c2", dealRef: "d1" })).rejects.toThrow("That deal is not this lead's.");
    const stray = await s.t.run((ctx) => ctx.db.insert("playbookItems", { workspaceId: s.workspaceId, folder: "offer", kind: "package", title: "Retainer", body: "", source: { type: "person" }, basis: "firstParty", status: "active", createdBy: "dana", createdAt: 1, updatedAt: 1 }));
    await expect(save({ contactRef: "c1", objections: [{ title: "", itemId: stray }] })).rejects.toThrow(/Pick objections/);
    const invite = await s.owner.mutation(api.workspace.invite, { workspaceId: s.workspaceId, email: "vera@example.com", role: "viewer" });
    const viewer = s.t.withIdentity(person("vera"));
    await viewer.mutation(api.workspace.acceptInvite, { token: invite.token });
    await expect(viewer.mutation(api.callNotes.save, { workspaceId: s.workspaceId, ...base, contactRef: "c1" })).rejects.toThrow();
    expect(await s.t.run((ctx) => ctx.db.query("callNotes").collect())).toEqual([]);
  });

  it("takes a name without a CRM, and writes no facts when there is no deal", async () => {
    const s = await setup({ crm: false });
    await expect(s.owner.mutation(api.callNotes.save, { workspaceId: s.workspaceId, ...base })).rejects.toThrow(/Say who the call was with/);
    await s.owner.mutation(api.callNotes.save, { workspaceId: s.workspaceId, ...base, leadName: "Jordan", fit: [{ field: "need", value: "More calls" }] });
    expect(await s.t.run((ctx) => ctx.db.query("dealFacts").collect())).toEqual([]);
  });

  async function withMemo(s: Awaited<ReturnType<typeof setup>>) {
    const storageId = (await s.t.run((ctx) => ctx.storage.store(new Blob(["fake audio"], { type: "audio/webm" })))) as Id<"_storage">;
    const callNoteId = await s.owner.mutation(api.callNotes.save, { workspaceId: s.workspaceId, ...base, contactRef: "c1", memo: { storageId, seconds: 42 } });
    await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const note = await s.owner.query(api.callNotes.get, { workspaceId: s.workspaceId, callNoteId });
    const audio = await s.t.run((ctx) => ctx.storage.get(storageId));
    return { note, audio };
  }

  it("transcribes the closer's memo with Deepgram and deletes the audio", async () => {
    vi.stubEnv("DEEPGRAM_API_KEY", "test-key");
    const calls: { url: string; auth: string | null }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, auth: new Headers(init.headers).get("Authorization") });
      return new Response(JSON.stringify({ results: { channels: [{ alternatives: [{ transcript: "She wants to start in January once her partner agrees." }] }] } }), { status: 200 });
    });
    const out = await withMemo(await setup());
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/^https:\/\/api\.deepgram\.com\/v1\/listen\?model=nova-3/);
    expect(calls[0].auth).toBe("Token test-key");
    expect(out.note.memo).toEqual({ status: "done", seconds: 42, transcript: "She wants to start in January once her partner agrees.", problem: null });
    expect(out.audio).toBeNull();
  });

  it("keeps the notes and says so when voice memos are not set up, still deleting the audio", async () => {
    vi.stubEnv("DEEPGRAM_API_KEY", "");
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    const out = await withMemo(await setup());
    expect(fetched).not.toHaveBeenCalled();
    expect(out.note.memo).toMatchObject({ status: "failed", problem: "Voice memos are not set up yet, so this one was not transcribed." });
    expect(out.audio).toBeNull();
  });

  it("reads Deepgram's answer defensively", () => {
    expect(transcriptOf({ results: { channels: [{ alternatives: [{ transcript: "Hello." }] }] } })).toBe("Hello.");
    expect(transcriptOf({})).toBe("");
    expect(transcriptOf(null)).toBe("");
  });
});
