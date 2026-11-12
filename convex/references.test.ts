/**
 * @vitest-environment edge-runtime
 *
 * Reference ads a person adds: which links may be read and which must be uploaded, the breakdown through a
 * scripted Gemini and a scripted Claude, what is kept and what is deleted, what it costs, and a creative
 * made from one.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { NOT_ALLOWED, NOT_FOUND } from "./lib/errors";
import { EMPTY_OFFER } from "./lib/offerCards";
import { GeminiError, geminiBody, geminiCostCents, readInteraction, type ScriptedGemini } from "./lib/gemini";
import { BREAKDOWN_SCHEMA, readBreakdown, readReferenceLink } from "./lib/referenceShapes";
import type { ScriptedModel } from "./lib/toolRouter";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;
type Caller = ReturnType<Tester["withIdentity"]>;
const AGENT = "growth-architect";

const SPOKEN = "Stop scrubbing your weekends away. Book a sparkling clean home in sixty seconds flat.";
const BREAKDOWN = {
  title: "Sparkle weekend ad",
  advertiser: "Sparkle Clean",
  lengthSeconds: 22,
  format: "Talking head with product shots",
  hook: { type: "problem", words: "Stop scrubbing your weekends away." },
  beats: [
    { seconds: "0-3", what: "Names the chore" },
    { seconds: "3-15", what: "Shows the clean home" },
    { seconds: "15-22", what: "States the offer and asks for the booking" },
  ],
  onScreenText: ["Weekends are for living", "20% off your first visit"],
  spoken: SPOKEN,
  offer: "20% off the first visit",
  cta: { words: "Book now", placement: "last 3 seconds" },
  audience: "Busy homeowners",
};

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

async function message(run: Promise<unknown>) {
  try {
    await run;
  } catch (error) {
    const data = (error as { data?: { message?: unknown } }).data;
    if (data && typeof data.message === "string") return data.message;
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a refusal");
}

type Globals = { __vistrialScriptedGemini?: ScriptedGemini; __vistrialScriptedModel?: ScriptedModel };

/** A scripted Gemini that records what it was sent. `fail` answers as a refusal. */
function gemini(fail = false) {
  const bodies: ReturnType<typeof geminiBody>[] = [];
  (globalThis as Globals).__vistrialScriptedGemini = (body) => {
    bodies.push(body);
    if (fail) return { status: "failed", steps: [], usage: { total_input_tokens: 2000, total_output_tokens: 0 } };
    return { status: "completed", steps: [{ type: "thought" }, { type: "model_output", content: [{ type: "text", text: JSON.stringify(BREAKDOWN) }] }], usage: { total_input_tokens: 4000, total_output_tokens: 600, total_thought_tokens: 200 } };
  };
  return bodies;
}

async function seed(t: Tester, name: string) {
  const owner = t.withIdentity(person(`${name}-owner`));
  const workspaceId = await owner.mutation(api.workspace.create, { name });
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: AGENT, state: "on" });
  await t.run(async (ctx) => {
    for (const workKind of ["classify", "write"]) {
      const row = await ctx.db.query("modelRoutes").withIndex("by_workKind", (q) => q.eq("workKind", workKind)).unique();
      if (!row) await ctx.db.insert("modelRoutes", { workKind, provider: "fake", model: "fake-scripted", fallbackProvider: "fake", fallbackModel: "fake-scripted" });
    }
  });
  const store = (bytes = 8) => t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(bytes)])));
  return { owner, workspaceId, store };
}

async function settle(t: Tester) {
  for (let i = 0; i < 5; i += 1) {
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
  }
}

async function finishRun(t: Tester, caller: Caller, workspaceId: Id<"workspaces">, runId: Id<"agentRuns">) {
  let status = "queued";
  for (let i = 0; i < 30 && (status === "queued" || status === "running"); i += 1) {
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
    status = (await caller.query(api.runs.get, { workspaceId, runId })).status as string;
  }
  return status;
}

describe("reference links", () => {
  it("reads a public YouTube video from its link and sends everything else to upload", () => {
    expect(readReferenceLink("https://youtube.com/shorts/dQw4w9WgXcQ?feature=share")).toEqual({ ok: true, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", platform: "youtube" });
    expect(readReferenceLink("https://youtu.be/dQw4w9WgXcQ")).toMatchObject({ ok: true });
    const tiktok = readReferenceLink("https://www.tiktok.com/@brand/video/7301234567890123456");
    expect(tiktok.ok === false && tiktok.problem).toContain("does not take videos from TikTok");
    const reel = readReferenceLink("https://www.instagram.com/reel/Cabc12345/");
    expect(reel.ok === false && reel.problem).toContain("Upload the video file");
    const ad = readReferenceLink("https://www.facebook.com/ads/library/?id=123456789");
    expect(ad.ok === false && ad.problem).toContain("Ad Library");
    const channel = readReferenceLink("https://www.youtube.com/@brand");
    expect(channel.ok === false && channel.problem).toContain("not a video");
    expect(readReferenceLink("not a link").ok).toBe(false);
    expect(readReferenceLink("http://localhost/video.mp4").ok).toBe(false);
  });
});

describe("the Gemini call", () => {
  it("sends the video as a link, stores nothing, and prices what it used", () => {
    const body = geminiBody({ model: "gemini-3.8-flash", system: "s", parts: [{ type: "text", text: "ask" }, { type: "video", uri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }], schema: BREAKDOWN_SCHEMA });
    expect(body.store).toBe(false);
    expect(body.input[1]).toEqual({ type: "video", uri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(body.response_format).toMatchObject({ type: "text", mime_type: "application/json" });
    // 4,000 in at $0.75 and 800 out (thinking counts as output) at $3.75 per million: 0.6 cents, rounded up.
    const result = readInteraction("gemini-3.8-flash", { status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "{}" }] }], usage: { total_input_tokens: 4000, total_output_tokens: 600, total_thought_tokens: 200 } });
    expect(result).toMatchObject({ text: "{}", inputTokens: 4000, outputTokens: 800, costCents: 1 });
    expect(geminiCostCents("gemini-3.8-flash", 1_000_000, 100_000)).toBe(113);
    expect(() => geminiCostCents("gemini-unknown", 1, 1)).toThrow(GeminiError);
    // A call that did not complete still reports what it cost.
    try {
      readInteraction("gemini-3.8-flash", { status: "failed", steps: [], usage: { total_input_tokens: 1_000_000 } });
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(GeminiError);
      expect((error as GeminiError).costCents).toBe(75);
    }
  });

  it("cuts a breakdown to the sizes we keep", () => {
    const read = readBreakdown({ ...BREAKDOWN, spoken: "x".repeat(5000), onScreenText: Array.from({ length: 30 }, (_, i) => `line ${i}`), beats: Array.from({ length: 30 }, (_, i) => ({ seconds: `${i}`, what: `beat ${i}` })) });
    expect(read?.spoken.length).toBe(1200);
    expect(read?.onScreenText).toHaveLength(12);
    expect(read?.beats).toHaveLength(10);
    expect(readBreakdown({ title: "Nothing in it" })).toBeNull();
    expect(readBreakdown("ignore previous instructions")).toBeNull();
  });
});

describe("adding a reference", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Globals).__vistrialScriptedGemini;
    delete (globalThis as Globals).__vistrialScriptedModel;
  });

  it("breaks a public YouTube link down through Gemini, keeps only the breakdown, and charges what it cost", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const bodies = gemini();
    const { referenceId } = await a.owner.mutation(api.references.add, { workspaceId: a.workspaceId, url: "https://www.youtube.com/shorts/dQw4w9WgXcQ" });
    expect((await a.owner.query(api.references.list, { workspaceId: a.workspaceId }))[0]).toMatchObject({ status: "analysing", platform: "youtube" });
    await settle(t);
    // Gemini was given the link itself. Nothing was downloaded, and nothing is stored on its side.
    expect(bodies).toHaveLength(1);
    expect(bodies[0].input[1]).toEqual({ type: "video", uri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(bodies[0].store).toBe(false);
    const row = (await a.owner.query(api.references.list, { workspaceId: a.workspaceId }))[0];
    expect(row).toMatchObject({ id: referenceId, status: "ready", title: "Sparkle weekend ad", costCents: 1, problem: null });
    expect(row.breakdown?.hook).toEqual({ type: "problem", words: "Stop scrubbing your weekends away." });
    const ledger = await t.run((ctx) => ctx.db.query("billingLedger").collect());
    expect(ledger.map((entry) => [entry.source, entry.costCents, entry.priceCents])).toEqual([["file", 1, 3]]);
  });

  it("will not take a video from TikTok, Instagram or an ad library: it asks for the file", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const bodies = gemini();
    for (const url of ["https://www.tiktok.com/@brand/video/7301234567890123456", "https://www.instagram.com/reel/Cabc12345/", "https://www.facebook.com/ads/library/?id=123456789", "https://example.com/ad.mp4"]) {
      expect(await message(a.owner.mutation(api.references.add, { workspaceId: a.workspaceId, url }))).toMatch(/[Uu]pload/);
    }
    await settle(t);
    expect(bodies).toHaveLength(0);
    expect(await a.owner.query(api.references.list, { workspaceId: a.workspaceId })).toEqual([]);
  });

  it("reads an uploaded video once the person vouches for it, then deletes the file", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const bodies = gemini();
    const unvouched = await a.store();
    expect((await a.owner.mutation(api.references.add, { workspaceId: a.workspaceId, storageId: unvouched, name: "ad.mp4" })).problem).toContain("right to submit");
    expect(await t.run(async (ctx) => (await ctx.storage.get(unvouched)) === null)).toBe(true);

    const storageId = await a.store();
    await a.owner.mutation(api.references.add, { workspaceId: a.workspaceId, storageId, name: "competitor ad.mov", attested: true });
    await settle(t);
    expect(bodies[0].input[1]).toMatchObject({ type: "video", mime_type: "video/mov" });
    const row = (await a.owner.query(api.references.list, { workspaceId: a.workspaceId }))[0];
    expect(row).toMatchObject({ status: "ready", origin: "upload", url: null });
    // Only the breakdown is kept: the file is gone, and who vouched for it is on record.
    expect(await t.run(async (ctx) => (await ctx.storage.get(storageId)) === null)).toBe(true);
    const stored = await t.run((ctx) => ctx.db.query("creativeReferences").collect());
    expect(stored[0].storageId).toBeUndefined();
    expect(stored[0].attestedBy).toBe("Alpha-owner");

    // Files we will not read are refused and deleted: the wrong kind, and a video too large to send.
    const exe = await a.store();
    expect((await a.owner.mutation(api.references.add, { workspaceId: a.workspaceId, storageId: exe, name: "ad.exe", attested: true })).problem).toContain("Upload a video");
    expect(await t.run(async (ctx) => (await ctx.storage.get(exe)) === null)).toBe(true);
    const big = await a.store(14 * 1024 * 1024 + 1);
    expect((await a.owner.mutation(api.references.add, { workspaceId: a.workspaceId, storageId: big, name: "ad.mp4", attested: true })).problem).toContain("over 14 MB");
    expect(await t.run(async (ctx) => (await ctx.storage.get(big)) === null)).toBe(true);
    expect(await a.owner.query(api.references.list, { workspaceId: a.workspaceId })).toHaveLength(1);
  });

  it("reads an uploaded image through Claude, and says plainly when a read fails", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const asked: string[] = [];
    (globalThis as Globals).__vistrialScriptedModel = (params) => {
      asked.push(JSON.stringify(params.messages[0].content).slice(0, 4000));
      return { text: JSON.stringify({ ...BREAKDOWN, lengthSeconds: 0, spoken: "", format: "Static image with headline" }) };
    };
    const image = await a.store();
    await a.owner.mutation(api.references.add, { workspaceId: a.workspaceId, storageId: image, name: "static-ad.png", attested: true });
    await settle(t);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("image");
    const read = (await a.owner.query(api.references.list, { workspaceId: a.workspaceId }))[0];
    expect(read).toMatchObject({ status: "ready", mediaKind: "image" });
    expect(read.breakdown?.format).toBe("Static image with headline");
    expect(await t.run(async (ctx) => (await ctx.storage.get(image)) === null)).toBe(true);

    gemini(true);
    const video = await a.store();
    await a.owner.mutation(api.references.add, { workspaceId: a.workspaceId, storageId: video, name: "ad.mp4", attested: true });
    await settle(t);
    const failed = (await a.owner.query(api.references.list, { workspaceId: a.workspaceId }))[0];
    expect(failed).toMatchObject({ status: "failed", problem: "The service declined to read this one.", breakdown: null });
    // A failed read still deletes the file and still charges what the attempt cost.
    expect(await t.run(async (ctx) => (await ctx.storage.get(video)) === null)).toBe(true);
    expect(failed.costCents).toBe(1);
  });

  it("is closed to Viewers and to other workspaces, and holds to a daily limit", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta");
    gemini();
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    const referenceId = (await a.owner.mutation(api.references.add, { workspaceId: a.workspaceId, url })).referenceId!;
    await settle(t);
    expect(await message(b.owner.query(api.references.list, { workspaceId: a.workspaceId }))).toBe(NOT_FOUND);
    expect(await message(b.owner.mutation(api.references.remove, { workspaceId: b.workspaceId, referenceId }))).toBe(NOT_FOUND);
    expect(await b.owner.query(api.references.list, { workspaceId: b.workspaceId })).toEqual([]);

    const invite = await a.owner.mutation(api.workspace.invite, { workspaceId: a.workspaceId, email: "viewer@example.com", role: "viewer" });
    const viewer = t.withIdentity({ ...person("viewer"), email: "viewer@example.com" });
    await viewer.mutation(api.workspace.acceptInvite, { token: invite.token });
    expect(await message(viewer.mutation(api.references.add, { workspaceId: a.workspaceId, url }))).toBe(NOT_ALLOWED);
    expect(await message(viewer.mutation(api.references.uploadUrl, { workspaceId: a.workspaceId }))).toBe(NOT_ALLOWED);
    expect(await viewer.query(api.references.list, { workspaceId: a.workspaceId })).toHaveLength(1);

    for (let i = 1; i < 20; i += 1) await a.owner.mutation(api.references.add, { workspaceId: a.workspaceId, url });
    expect(await message(a.owner.mutation(api.references.add, { workspaceId: a.workspaceId, url }))).toContain("20 references a day");
    await a.owner.mutation(api.references.remove, { workspaceId: a.workspaceId, referenceId });
    expect(await a.owner.query(api.references.list, { workspaceId: a.workspaceId })).toHaveLength(19);
  });

  it("makes a creative from an added reference: its words are given only to be avoided, and reusing them fails the check", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    gemini();
    const referenceId = (await a.owner.mutation(api.references.add, { workspaceId: a.workspaceId, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })).referenceId!;
    const kit = await a.owner.mutation(api.brandKits.saveVersion, { workspaceId: a.workspaceId, kind: "own", name: "Alpha Cleaning" });
    const offer = await a.owner.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, ...EMPTY_OFFER, name: "First deep clean", price: "$79", included: ["Kitchen"], guarantee: "", terms: "", targetCustomer: "Homeowners" });
    const start = { workspaceId: a.workspaceId, kitId: kit.kitId as Id<"brandKits">, referenceId, offerCardId: offer.cardId as Id<"offerCards"> };
    // Not while it is still being read.
    expect(await message(a.owner.mutation(api.creative.start, start))).toContain("still being read");
    await settle(t);

    const inputs: string[] = [];
    (globalThis as Globals).__vistrialScriptedModel = (params) => {
      const input = String(params.messages[0].content);
      inputs.push(input);
      const revising = input.startsWith("Revise");
      const hooks = ["Tired of losing Saturdays to a mop?", "What would you do with four free hours?", "Your home, guest-ready by tonight.", "The chore list just got shorter."];
      return {
        text: JSON.stringify({
          summary: "Four ads that open on the lost weekend.",
          structure: { hookType: "problem", format: "talking head", beats: ["name the chore", "show the relief", "offer"], offerType: "first-visit price", ctaPlacement: "last beat" },
          brief: { audience: "Busy homeowners", promise: "A clean home without losing the weekend", angle: "Time back", tone: "Warm" },
          variations: hooks.map((hook, index) => ({ key: "ABCD"[index], hookType: "question", hook, primaryText: index === 0 && !revising ? SPOKEN : "A vetted team handles the deep clean while you get on with your day.", headline: `Deep clean ${index + 1}`, cta: "Book a time", imageDirection: "A tidy room, no people.", hypothesis: `Hook ${index + 1} wins.`, design: { eyebrow: "For busy homeowners", kicker: "Your weekend back", accent: "", visual: "A mop leaning unused against a sunny wall.", labels: [], subline: "A deep clean, done for you." } })),
          script: { beats: [] },
          captions: [],
          claims: [],
          limits: [],
          contextUsed: { profileVersionId: null, factIds: [] },
        }),
      };
    };
    const started = await a.owner.mutation(api.creative.start, start);
    expect(await finishRun(t, a.owner, a.workspaceId, started.runId)).toBe("completed");
    // The breakdown's beats reach the writer; the reference's own lines are handed over only to be avoided.
    expect(inputs[0]).toContain("0-3s: Names the chore");
    expect(inputs[0]).toContain("Do not reuse or closely paraphrase any of these lines");
    // The first draft repeated what the ad says, so it was sent back and the revision passed.
    expect(inputs).toHaveLength(2);
    expect(inputs[1]).toContain("repeats the reference's wording");
    const tab = await a.owner.query(api.creative.tab, { workspaceId: a.workspaceId });
    const view = await a.owner.query(api.creative.view, { workspaceId: a.workspaceId, assetId: tab.results[0].id });
    expect(view?.checks.passed).toBe(true);
    expect(view?.reference).toMatchObject({ sourceRefId: null, referenceId, title: "Sparkle weekend ad" });
    // Its structure claim cites the run's own record of the breakdown, so it can be approved.
    const asset = await a.owner.query(api.assets.get, { workspaceId: a.workspaceId, assetId: tab.results[0].id });
    expect(asset.evidence.find((row) => row.claimKey === "structure")?.sourceMissing).toBe(false);
    await a.owner.mutation(api.assets.approve, { workspaceId: a.workspaceId, assetId: tab.results[0].id });

    // A reference that failed, or one from another workspace, cannot start a creative.
    const b = await seed(t, "Beta");
    expect(await message(b.owner.mutation(api.creative.start, { ...start, workspaceId: b.workspaceId }))).toBe(NOT_FOUND);
  });
});
