/**
 * @vitest-environment edge-runtime
 *
 * Images for an ad set: the price shown before anything is spent, the confirmation, the hold on credit while
 * images are being made, charging only for what is delivered, and what the image model is and is not told.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { EMPTY_BRAND } from "./lib/brandKits";
import { designedPrompt, imagePrompt, missingText } from "./lib/creativeImages";
import { NOT_ALLOWED, NOT_FOUND } from "./lib/errors";
import { geminiImageBody, imageCostCents, readImage, type ScriptedGeminiImage } from "./lib/gemini";
import type { ScriptedModel } from "./lib/toolRouter";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;
const AGENT = "growth-architect";
type Globals = { __vistrialScriptedGeminiImage?: ScriptedGeminiImage; __vistrialScriptedModel?: ScriptedModel };

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

/** A scripted image model that records every request. `failOn` refuses requests whose prompt holds that text. */
function imageModel(failOn?: string) {
  const bodies: ReturnType<typeof geminiImageBody>[] = [];
  (globalThis as Globals).__vistrialScriptedGeminiImage = (body) => {
    bodies.push(body);
    if (failOn && JSON.stringify(body.input[0]).includes(failOn)) return { status: "completed", steps: [{ type: "model_output", content: [{ type: "text" }] }] };
    return { status: "completed", steps: [{ type: "thought" }, { type: "model_output", content: [{ type: "image", data: "aGVsbG8=", mime_type: "image/jpeg" }] }] };
  };
  return bodies;
}

const variation = (key: string) => ({
  key,
  hookType: "question",
  hook: `Hook ${key}`,
  primaryText: "Copy.",
  headline: `You are leaking jobs ${key}`,
  cta: "Find your leak",
  imageDirection: `A tidy room for ${key}`,
  hypothesis: "It wins.",
  design: { eyebrow: "For busy homeowners", kicker: "Where the time goes", accent: "leaking jobs", visual: `A glass funnel with holes, for ${key}`, labels: ["Missed call", "No follow-up"], subline: "After you already paid for them." },
});
/** Every line a designed ad for a variation must show. */
const wordsOf = (key: string) => ["For busy homeowners", "WHERE THE TIME GOES", `You are leaking jobs ${key}`, "Missed call", "No follow-up", "After you already paid for them.", "FIND YOUR LEAK →"];

/** A workspace with a brand kit and an ad set as Creative Production saves it. */
async function seed(t: Tester, name: string, status: "draft" | "needsReview" = "draft") {
  const owner = t.withIdentity(person(`${name}-owner`));
  const workspaceId = await owner.mutation(api.workspace.create, { name });
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: AGENT, state: "on" });
  const kit = await owner.mutation(api.brandKits.saveVersion, { workspaceId, kind: "own", name: `${name} Cleaning`, imageStyle: "Bright and calm.", colors: [{ label: "Teal", hex: "#0f8b8d" }], placements: ["1:1", "9:16"] });
  const assetId = await t.run(async (ctx) => {
    const runId = await ctx.db.insert("agentRuns", { workspaceId, agentSlug: AGENT, skillSlug: "creative-production", status: "completed", startedBy: "seed", inputRef: "x", startedAt: 1, costCents: 0, inputTokens: 0, outputTokens: 0 });
    const stepId = await ctx.db.insert("runSteps", { workspaceId, runId, index: 0, idempotencyKey: `${runId}:0`, kind: "tool", status: "completed", durationMs: 0, inputTokens: 0, outputTokens: 0, resultCode: "ok" });
    const record = {
      creative: { summary: "s", structure: {}, brief: {}, variations: ["A", "B", "C", "D"].map(variation), script: { beats: [] }, captions: [], claims: [], limits: [], contextUsed: {} },
      checks: { passed: status === "draft", results: [] },
      versions: 1,
      dial: "structure",
      kit: { id: kit.kitId, name: `${name} Cleaning`, kind: "own", version: 1 },
      reference: { sourceRefId: null, title: "Rival ad", url: null, platform: "upload", publisher: "Rival Co" },
      offer: null,
      disclaimers: [],
    };
    const body = JSON.stringify(record);
    await ctx.db.insert("runArtifacts", { workspaceId, runId, stepId, kind: "creative", byteSize: body.length, body });
    return ctx.db.insert("assets", { workspaceId, kind: "adCopySet", title: "Ad set", status, currentVersion: 1, createdByRun: runId, createdAt: 1 });
  });
  return { owner, workspaceId, assetId, kitId: kit.kitId as Id<"brandKits"> };
}

async function settle(t: Tester) {
  for (let i = 0; i < 20; i += 1) {
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
  }
}

async function fund(t: Tester, workspaceId: Id<"workspaces">, balanceCents: number) {
  await t.run((ctx) => ctx.db.insert("billingAccounts", { workspaceId, balanceCents, refreshedAt: 1 }));
}

describe("the image request", () => {
  it("asks for a picture with no text, no logo and no recognisable person, from the brand kit alone", () => {
    const prompt = imagePrompt({ direction: "A bright kitchen.", kit: { ...EMPTY_BRAND, imageStyle: "Natural light.", colors: [{ label: "Teal", hex: "#0f8b8d" }], industry: "Cleaning" }, placement: "9:16" });
    expect(prompt).toContain("A bright kitchen.");
    expect(prompt).toContain("Natural light.");
    expect(prompt).toContain("#0f8b8d");
    expect(prompt).toContain("no text");
    expect(prompt).toContain("No logos");
    expect(prompt).toContain("No real or recognisable people");
    const body = geminiImageBody({ model: "gemini-nano-banana-2.1", prompt, aspect: "9:16", size: "2K" });
    expect(body.response_format).toEqual({ type: "image", mime_type: "image/jpeg", aspect_ratio: "9:16", image_size: "2K" });
    expect(body.store).toBe(false);
    expect(imageCostCents("gemini-nano-banana-2.1", "2K")).toBe(5.04);
    expect(() => imageCostCents("some-other-model", "2K")).toThrow();
    expect(() => readImage({ status: "completed", steps: [{ type: "model_output", content: [] }] })).toThrow();
  });

  it("gives a designed ad every word exactly, and knows which ones a reading did not find", () => {
    const light = designedPrompt({ text: { eyebrow: "For roofers", kicker: "", headline: "Stop racing for the same lead.", accent: "same lead", visual: "One house, five phones.", labels: [], subline: "", cta: "Start" }, kit: { ...EMPTY_BRAND, name: "Alpha" }, placement: "1.91:1", tone: "light", styleRefs: 0 });
    expect(light).toContain('"Stop racing for the same lead."');
    expect(light).toContain("wide frame");
    expect(light).toContain("near-black text");
    expect(light).toContain("No labels on the visual.");
    expect(light).not.toContain("attached image");
    expect(light).toContain("Never: a logo");
    // Case, punctuation and the arrow on a button do not matter. A misspelling and a missing line do.
    expect(missingText(["Stop racing for the same lead.", "START"], ["STOP RACING FOR THE SAME LEAD", "Start →"])).toEqual([]);
    expect(missingText(["Stop racing for the same lead.", "Start"], ["Stop raceing for the same lead."])).toEqual(["Stop racing for the same lead.", "Start"]);
  });
});

describe("images for an ad set", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Globals).__vistrialScriptedGeminiImage;
    delete (globalThis as Globals).__vistrialScriptedModel;
    delete process.env.AUTUMN_SECRET_KEY;
  });

  it("shows the price first, makes exactly what was confirmed, and charges only for what was delivered", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const bodies = imageModel();
    // One image per variation per placement: 4 × 2, at 5.04 cents of cost each, which is 16 cents of credit.
    const quote = await a.owner.query(api.creativeImages.quote, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["9:16", "1:1"], look: "photo" });
    expect(quote).toMatchObject({ count: 8, eachCents: 16, totalCents: 128, variations: 4, placements: ["1:1", "9:16"], kitPlacements: ["1:1", "9:16"], canAfford: true, blocked: null });

    // Confirming a different total makes nothing.
    expect(await message(a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["1:1", "9:16"], look: "photo", confirmedCents: 64 }))).toContain("price changed");
    expect(await a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["1:1", "9:16"], look: "photo", confirmedCents: 128 })).toEqual({ started: 8, totalCents: 128 });
    // Pressing again while they are being made starts nothing more.
    expect(await a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["1:1", "9:16"], look: "photo", confirmedCents: 128 })).toEqual({ started: 0, totalCents: 0 });
    await settle(t);

    expect(bodies).toHaveLength(8);
    // The reference ad is no part of what the image model is told.
    expect(bodies.every((body) => !/Rival/i.test(JSON.stringify(body)))).toBe(true);
    expect(bodies.map((body) => body.response_format.aspect_ratio).sort()).toEqual(["1:1", "1:1", "1:1", "1:1", "9:16", "9:16", "9:16", "9:16"]);

    const listed = await a.owner.query(api.creativeImages.list, { workspaceId: a.workspaceId, assetId: a.assetId });
    expect(listed.brand).toMatchObject({ name: "Alpha Cleaning", accent: "#0f8b8d", logoUrl: null });
    expect(listed.images.filter((row) => row.status === "ready" && row.url)).toHaveLength(8);

    // Eight delivered, eight charged at 16 cents of credit each.
    const ledger = await t.run((ctx) => ctx.db.query("billingLedger").collect());
    expect(ledger.map((row) => [row.source, row.costCents, row.priceCents])).toEqual(Array.from({ length: 8 }, () => ["creative", 5.04, 16]));

    // One again, at its own price. The picture it replaces is deleted once the new one is in.
    imageModel();
    const before = await t.run((ctx) => ctx.db.query("creativeImages").collect());
    const kept = before.find((row) => row.variationKey === "A" && row.placement === "1:1")!;
    await a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: [], look: "photo", confirmedCents: 16, only: { variationKey: "A", placement: "1:1" } });
    await settle(t);
    const after = (await t.run((ctx) => ctx.db.query("creativeImages").collect())).find((row) => row._id === kept._id)!;
    expect(after.storageId).not.toBe(kept.storageId);
    expect(await t.run(async (ctx) => (await ctx.storage.get(kept.storageId!)) === null)).toBe(true);
    expect((await t.run((ctx) => ctx.db.query("creativeImages").collect())).length).toBe(8);
    expect(await t.run(async (ctx) => (await ctx.db.query("billingLedger").collect()).length)).toBe(9);

    // A retake the service declines keeps the picture already there, and costs nothing.
    imageModel("for B");
    await a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: [], look: "photo", confirmedCents: 16, only: { variationKey: "B", placement: "1:1" } });
    await settle(t);
    const retaken = (await a.owner.query(api.creativeImages.list, { workspaceId: a.workspaceId, assetId: a.assetId })).images.find((row) => row.variationKey === "B" && row.placement === "1:1");
    expect(retaken).toMatchObject({ status: "ready", problem: null });
    expect(await t.run(async (ctx) => (await ctx.db.query("billingLedger").collect()).length)).toBe(9);
  });

  it("charges nothing for an image the service declines, and says so plainly", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    imageModel("for C");
    await a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: [], look: "photo", confirmedCents: 16, only: { variationKey: "C", placement: "9:16" } });
    await settle(t);
    const listed = await a.owner.query(api.creativeImages.list, { workspaceId: a.workspaceId, assetId: a.assetId });
    expect(listed.images).toHaveLength(1);
    expect(listed.images[0]).toMatchObject({ variationKey: "C", status: "failed", url: null });
    expect(listed.images[0].problem).toContain("declined");
    expect(await t.run((ctx) => ctx.db.query("billingLedger").collect())).toEqual([]);
    expect((await t.run((ctx) => ctx.db.query("creativeImages").collect()))[0].holdCents).toBe(0);
  });

  it("holds the price while images are being made, so two batches cannot spend the same credit", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    imageModel();
    process.env.AUTUMN_SECRET_KEY = "am_sk_test";
    await fund(t, a.workspaceId, 100);
    // 100 cents covers four images (64) and not eight (128).
    expect(await a.owner.query(api.creativeImages.quote, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["1:1", "9:16"], look: "photo" })).toMatchObject({ totalCents: 128, availableCents: 100, canAfford: false });
    expect(await message(a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["1:1", "9:16"], look: "photo", confirmedCents: 128 }))).toContain("does not cover these images");
    await a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["1:1"], look: "photo", confirmedCents: 64 });
    // While those four are being made, 64 of the 100 is spoken for: a second batch of four does not fit.
    expect(await a.owner.query(api.creativeImages.quote, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["9:16"], look: "photo" })).toMatchObject({ availableCents: 36, canAfford: false });
    expect(await message(a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["9:16"], look: "photo", confirmedCents: 64 }))).toContain("does not cover these images");
    delete process.env.AUTUMN_SECRET_KEY;
    await settle(t);
    // Delivered and charged: the hold is gone and the balance is what was really spent.
    const account = await t.run((ctx) => ctx.db.query("billingAccounts").first());
    expect(account?.balanceCents).toBe(36);
    expect((await t.run((ctx) => ctx.db.query("creativeImages").collect())).every((row) => row.holdCents === 0 && row.status === "ready")).toBe(true);
  });

  it("spends nothing on an ad set that failed its checks, for a Viewer, or across workspaces", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta", "needsReview");
    const bodies = imageModel();
    expect((await b.owner.query(api.creativeImages.quote, { workspaceId: b.workspaceId, assetId: b.assetId, placements: ["1:1"], look: "photo" })).blocked).toContain("did not pass its checks");
    expect(await message(b.owner.mutation(api.creativeImages.generate, { workspaceId: b.workspaceId, assetId: b.assetId, placements: ["1:1"], look: "photo", confirmedCents: 64 }))).toContain("did not pass its checks");

    expect(await message(b.owner.query(api.creativeImages.quote, { workspaceId: b.workspaceId, assetId: a.assetId, placements: ["1:1"], look: "photo" }))).toBe(NOT_FOUND);
    expect(await message(b.owner.mutation(api.creativeImages.generate, { workspaceId: b.workspaceId, assetId: a.assetId, placements: ["1:1"], look: "photo", confirmedCents: 64 }))).toBe(NOT_FOUND);
    expect(await message(b.owner.query(api.creativeImages.list, { workspaceId: a.workspaceId, assetId: a.assetId }))).toBe(NOT_FOUND);

    const invite = await a.owner.mutation(api.workspace.invite, { workspaceId: a.workspaceId, email: "viewer@example.com", role: "viewer" });
    const viewer = t.withIdentity({ ...person("viewer"), email: "viewer@example.com" });
    await viewer.mutation(api.workspace.acceptInvite, { token: invite.token });
    expect(await message(viewer.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["1:1"], look: "photo", confirmedCents: 64 }))).toBe(NOT_ALLOWED);

    expect(await message(a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["3:2"], look: "photo", confirmedCents: 64 }))).toContain("not one Vistrial makes");
    expect(await message(a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["1:1", "4:5", "9:16", "16:9"], look: "photo", confirmedCents: 256 }))).toContain("12 images at a time");
    await settle(t);
    expect(bodies).toHaveLength(0);
  });
  it("draws a designed ad with the words in it, follows the brand's own ads, and reads every word back", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    // The brand kit holds one of the brand's own ads as a picture of its look.
    const own = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(6)])));
    await a.owner.mutation(api.brandKits.saveVersion, { workspaceId: a.workspaceId, kitId: a.kitId, name: "Alpha Cleaning", colors: [{ label: "Violet", hex: "#9a88fc" }], placements: ["1:1"], styleRefs: [{ storageId: own, name: "our-ad.png" }], styleRefsOwned: true });
    await t.run(async (ctx) => {
      await ctx.db.insert("modelRoutes", { workKind: "classify", provider: "fake", model: "fake-scripted", fallbackProvider: "fake", fallbackModel: "fake-scripted" });
      // The ad set was made with version 1 of the kit; point it at the version that holds the example ad.
      const artifact = (await ctx.db.query("runArtifacts").collect()).find((row) => row.kind === "creative")!;
      const record = JSON.parse(artifact.body!);
      record.kit.version = 2;
      await ctx.db.patch(artifact._id, { body: JSON.stringify(record) });
    });
    const bodies = imageModel();
    // The first reading of A misspells the headline; every other reading is right.
    let reads = 0;
    (globalThis as Globals).__vistrialScriptedModel = () => {
      reads += 1;
      const key = "ABCD"[Math.max(0, reads - 2)] ?? "D";
      return { text: JSON.stringify({ lines: reads === 1 ? wordsOf("A").map((line) => line.replace("leaking", "leeking")) : wordsOf(reads === 2 ? "A" : key) }) };
    };

    const quote = await a.owner.query(api.creativeImages.quote, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["1:1"] });
    // A designed image costs 13.4 cents plus half a cent for reading it back: 42 cents of credit.
    expect(quote).toMatchObject({ look: "designed", count: 4, eachCents: 42, totalCents: 168, styleRefs: 1 });
    expect(quote.looks.map((row) => [row.value, row.eachCents])).toEqual([["designed", 42], ["photo", 16]]);

    // One at a time, so each reading is matched to its picture.
    for (const key of ["A", "B", "C", "D"]) {
      await a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: [], confirmedCents: 42, look: "designed", tone: "dark", only: { variationKey: key, placement: "1:1" } });
      await settle(t);
    }
    // A was drawn twice (the first had a misspelling), the others once.
    expect(bodies).toHaveLength(5);
    const first = bodies[0];
    expect(first.model).toBe("gemini-3-pro-image");
    const prompt = (first.input[0] as { text: string }).text;
    expect(prompt).toContain('"You are leaking jobs A"');
    expect(prompt).toContain('Set the words "leaking jobs" in the accent colour');
    expect(prompt).toContain('"Missed call", "No follow-up"');
    expect(prompt).toContain("#9a88fc");
    expect(prompt).toContain("near-black background");
    expect(prompt).toContain("show exactly the words given above");
    // The brand's own ad goes along as a picture of the look. The ad the creative was modelled on never does.
    expect(first.input.filter((part) => part.type === "image")).toHaveLength(1);
    expect(bodies.every((body) => !/Rival/i.test(JSON.stringify(body.input[0])))).toBe(true);

    const listed = await a.owner.query(api.creativeImages.list, { workspaceId: a.workspaceId, assetId: a.assetId });
    expect(listed.images.map((row) => [row.variationKey, row.look, row.status])).toEqual([["A", "designed", "ready"], ["B", "designed", "ready"], ["C", "designed", "ready"], ["D", "designed", "ready"]]);
    // Four kept, four charged at the price quoted. The picture that was thrown away cost the customer nothing.
    const ledger = await t.run((ctx) => ctx.db.query("billingLedger").collect());
    expect(ledger.map((row) => row.priceCents)).toEqual([42, 42, 42, 42]);
  });

  it("does not keep or charge for a designed ad whose words come out wrong twice", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    await t.run((ctx) => ctx.db.insert("modelRoutes", { workKind: "classify", provider: "fake", model: "fake-scripted", fallbackProvider: "fake", fallbackModel: "fake-scripted" }));
    const bodies = imageModel();
    (globalThis as Globals).__vistrialScriptedModel = () => ({ text: JSON.stringify({ lines: ["You are leeking jobs A", "FIND YOUR LEEK"] }) });
    await a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: [], confirmedCents: 42, look: "designed", only: { variationKey: "A", placement: "1:1" } });
    await settle(t);
    expect(bodies).toHaveLength(2);
    const listed = await a.owner.query(api.creativeImages.list, { workspaceId: a.workspaceId, assetId: a.assetId });
    expect(listed.images[0]).toMatchObject({ status: "failed", url: null });
    expect(listed.images[0].problem).toContain("wrong words twice");
    expect(await t.run((ctx) => ctx.db.query("billingLedger").collect())).toEqual([]);
    expect(await t.run(async (ctx) => (await ctx.db.system.query("_storage").collect()).length)).toBe(0);
  });
});
