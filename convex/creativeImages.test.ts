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
import { imagePrompt } from "./lib/creativeImages";
import { NOT_ALLOWED, NOT_FOUND } from "./lib/errors";
import { geminiImageBody, imageCostCents, readImage, type ScriptedGeminiImage } from "./lib/gemini";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;
const AGENT = "growth-architect";
type Globals = { __vistrialScriptedGeminiImage?: ScriptedGeminiImage };

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
    if (failOn && body.input[0].text.includes(failOn)) return { status: "completed", steps: [{ type: "model_output", content: [{ type: "text" }] }] };
    return { status: "completed", steps: [{ type: "thought" }, { type: "model_output", content: [{ type: "image", data: "aGVsbG8=", mime_type: "image/jpeg" }] }] };
  };
  return bodies;
}

const variation = (key: string) => ({ key, hookType: "question", hook: `Hook ${key}`, primaryText: "Copy.", headline: `Headline ${key}`, cta: "Book", imageDirection: `A tidy room for ${key}`, hypothesis: "It wins." });

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
  return { owner, workspaceId, assetId };
}

async function settle(t: Tester) {
  for (let i = 0; i < 20; i += 1) {
    vi.advanceTimersByTime(0);
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
});

describe("images for an ad set", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Globals).__vistrialScriptedGeminiImage;
    delete process.env.AUTUMN_SECRET_KEY;
  });

  it("shows the price first, makes exactly what was confirmed, and charges only for what was delivered", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const bodies = imageModel();
    // One image per variation per placement: 4 × 2, at 5.04 cents of cost each, which is 16 cents of credit.
    const quote = await a.owner.query(api.creativeImages.quote, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["9:16", "1:1"] });
    expect(quote).toMatchObject({ count: 8, eachCents: 16, totalCents: 128, variations: 4, placements: ["1:1", "9:16"], kitPlacements: ["1:1", "9:16"], canAfford: true, blocked: null });

    // Confirming a different total makes nothing.
    expect(await message(a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["1:1", "9:16"], confirmedCents: 64 }))).toContain("price changed");
    expect(await a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["1:1", "9:16"], confirmedCents: 128 })).toEqual({ started: 8, totalCents: 128 });
    // Pressing again while they are being made starts nothing more.
    expect(await a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["1:1", "9:16"], confirmedCents: 128 })).toEqual({ started: 0, totalCents: 0 });
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
    await a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: [], confirmedCents: 16, only: { variationKey: "A", placement: "1:1" } });
    await settle(t);
    const after = (await t.run((ctx) => ctx.db.query("creativeImages").collect())).find((row) => row._id === kept._id)!;
    expect(after.storageId).not.toBe(kept.storageId);
    expect(await t.run(async (ctx) => (await ctx.storage.get(kept.storageId!)) === null)).toBe(true);
    expect((await t.run((ctx) => ctx.db.query("creativeImages").collect())).length).toBe(8);
    expect(await t.run(async (ctx) => (await ctx.db.query("billingLedger").collect()).length)).toBe(9);

    // A retake the service declines keeps the picture already there, and costs nothing.
    imageModel("for B");
    await a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: [], confirmedCents: 16, only: { variationKey: "B", placement: "1:1" } });
    await settle(t);
    const retaken = (await a.owner.query(api.creativeImages.list, { workspaceId: a.workspaceId, assetId: a.assetId })).images.find((row) => row.variationKey === "B" && row.placement === "1:1");
    expect(retaken).toMatchObject({ status: "ready", problem: null });
    expect(await t.run(async (ctx) => (await ctx.db.query("billingLedger").collect()).length)).toBe(9);
  });

  it("charges nothing for an image the service declines, and says so plainly", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    imageModel("for C");
    await a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: [], confirmedCents: 16, only: { variationKey: "C", placement: "9:16" } });
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
    expect(await a.owner.query(api.creativeImages.quote, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["1:1", "9:16"] })).toMatchObject({ totalCents: 128, availableCents: 100, canAfford: false });
    expect(await message(a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["1:1", "9:16"], confirmedCents: 128 }))).toContain("does not cover these images");
    await a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["1:1"], confirmedCents: 64 });
    // While those four are being made, 64 of the 100 is spoken for: a second batch of four does not fit.
    expect(await a.owner.query(api.creativeImages.quote, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["9:16"] })).toMatchObject({ availableCents: 36, canAfford: false });
    expect(await message(a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["9:16"], confirmedCents: 64 }))).toContain("does not cover these images");
    delete process.env.AUTUMN_SECRET_KEY;
    await settle(t);
    // Delivered and charged: the hold is gone and the balance is what was really spent.
    const account = await t.run((ctx) => ctx.db.query("billingAccounts").first());
    expect(account?.balanceCents).toBe(36);
    expect((await t.run((ctx) => ctx.db.query("creativeImages").collect())).every((row) => row.holdCents === 0 && row.status === "ready")).toBe(true);
  });

  it("spends nothing on an ad set that failed its checks, for a Rep, or across workspaces", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta", "needsReview");
    const bodies = imageModel();
    expect((await b.owner.query(api.creativeImages.quote, { workspaceId: b.workspaceId, assetId: b.assetId, placements: ["1:1"] })).blocked).toContain("did not pass its checks");
    expect(await message(b.owner.mutation(api.creativeImages.generate, { workspaceId: b.workspaceId, assetId: b.assetId, placements: ["1:1"], confirmedCents: 64 }))).toContain("did not pass its checks");

    expect(await message(b.owner.query(api.creativeImages.quote, { workspaceId: b.workspaceId, assetId: a.assetId, placements: ["1:1"] }))).toBe(NOT_FOUND);
    expect(await message(b.owner.mutation(api.creativeImages.generate, { workspaceId: b.workspaceId, assetId: a.assetId, placements: ["1:1"], confirmedCents: 64 }))).toBe(NOT_FOUND);
    expect(await message(b.owner.query(api.creativeImages.list, { workspaceId: a.workspaceId, assetId: a.assetId }))).toBe(NOT_FOUND);

    const invite = await a.owner.mutation(api.workspace.invite, { workspaceId: a.workspaceId, email: "rep@example.com", role: "rep" });
    const rep = t.withIdentity({ ...person("rep"), email: "rep@example.com" });
    await rep.mutation(api.workspace.acceptInvite, { token: invite.token });
    expect(await message(rep.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["1:1"], confirmedCents: 64 }))).toBe(NOT_ALLOWED);

    expect(await message(a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["3:2"], confirmedCents: 64 }))).toContain("not one Vistrial makes");
    expect(await message(a.owner.mutation(api.creativeImages.generate, { workspaceId: a.workspaceId, assetId: a.assetId, placements: ["1:1", "4:5", "9:16", "16:9"], confirmedCents: 256 }))).toContain("12 images at a time");
    await settle(t);
    expect(bodies).toHaveLength(0);
  });
});
