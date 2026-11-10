/**
 * @vitest-environment edge-runtime
 *
 * Creative Production end to end, with a scripted model that answers like a real one: a full run from a
 * reference ad and an offer, the revision when the draft repeats the reference's wording, an unbacked claim
 * that never reaches approval, the refusals at the door, and workspace isolation.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { NOT_ALLOWED, NOT_FOUND } from "./lib/errors";
import { EMPTY_BRAND } from "./lib/brandKits";
import { EMPTY_OFFER } from "./lib/offerCards";
import { containsPhrase, longestSharedRun, sharedPhraseShare } from "./lib/similarity";
import type { ScriptedModel } from "./lib/toolRouter";
import { creativeProduction } from "./skills/creativeProduction";
import { claimSentences, claimStands, runChecks } from "./skills/creativeProduction/checks";
import { readCreative, type CreativeContext } from "./skills/creativeProduction/shapes";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;
type Caller = ReturnType<Tester["withIdentity"]>;
const AGENT = "growth-architect";

const REFERENCE_TEXT = "Stop scrubbing your weekends away. Book a sparkling clean home in sixty seconds flat and get twenty percent off your first visit.";

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

type Plan = {
  /** The first draft repeats the reference's wording; the revision does not. */
  copyReference?: boolean;
  /** Every draft states a result nothing on record backs. */
  unbacked?: boolean;
  /** The first draft uses a word the brand avoids. */
  avoided?: boolean;
};

/** A scripted model that records every input and answers from what the input shows. */
function script(plan: Plan = {}) {
  const inputs: string[] = [];
  const model: ScriptedModel = (params) => {
    const input = String(params.messages[0].content);
    inputs.push(input);
    if (!input.startsWith("Write the creative") && !input.startsWith("Revise the creative")) throw new Error(`unscripted call: ${input.slice(0, 40)}`);
    const revising = input.startsWith("Revise");
    const version = input.match(/\(version id ([^\s)]+)\):/)?.[1] ?? null;
    const facts = [...input.matchAll(/^- \[([^\]]+)\] \w+: /gm)].map((m) => m[1]);
    const hooks = ["Tired of losing Saturdays to a mop?", "What would you do with four free hours?", "Your home, guest-ready by tonight.", "The chore list just got shorter."];
    const variations = hooks.map((hook, index) => ({
      key: "ABCD"[index],
      hookType: ["question", "question", "bold claim", "relief"][index],
      hook,
      primaryText:
        index === 0 && plan.copyReference && !revising
          ? REFERENCE_TEXT
          : index === 1 && plan.unbacked
            ? "Rated #1 by 500 local families. Book in a minute."
            : index === 2 && plan.avoided && !revising
              ? "A cheap way to get your weekend back."
              : index === 3
                ? "Your first deep clean is $79. Pick a time that suits you."
                : "A vetted two-person team handles the deep clean while you get on with your day.",
      headline: `Deep clean, done for you ${index + 1}`,
      cta: "Book a time",
      imageDirection: "A bright, tidy living room in natural light, no people, lots of white space.",
      hypothesis: `Hook ${index + 1} will earn more clicks than the others.`,
      design: { eyebrow: "For busy homeowners", kicker: "Your weekend back", accent: "", visual: "A mop leaning unused against a sunny wall.", labels: [], subline: "A deep clean, done for you." },
    }));
    return {
      text: JSON.stringify({
        summary: "Four ads that open on the lost weekend and close on a simple booking.",
        structure: { hookType: "pain question", format: "short vertical video", beats: ["name the chore", "show the relief", "state the offer", "book"], offerType: "first-visit price", ctaPlacement: "last beat" },
        brief: { audience: "Busy homeowners", promise: "A clean home without giving up the weekend", angle: "Time back", tone: "Warm and plain" },
        variations,
        script: { beats: [{ seconds: "0-3", voiceover: "Another Saturday with a mop?", onScreen: "Saturdays are for living" }, { seconds: "3-12", voiceover: "We handle the deep clean.", onScreen: "Book a time" }] },
        captions: ["Weekends are short. Let us take the deep clean.", "Guests on the way? We have it covered.", "One booking, one tidy home."],
        claims: [{ text: "Your first deep clean is $79.", support: "offer", factIds: [] }],
        limits: ["No result figures are on record, so none are stated."],
        contextUsed: { profileVersionId: version, factIds: facts.slice(0, 1) },
      }),
    };
  };
  (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel = model;
  return inputs;
}

async function seed(t: Tester, name: string) {
  const owner = t.withIdentity(person(`${name}-owner`));
  const workspaceId = await owner.mutation(api.workspace.create, { name });
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: AGENT, state: "on" });
  await owner.mutation(api.profile.saveDraft, { workspaceId, offer: "Deep house cleaning", priceNotes: "", audience: "Homeowners", geography: `${name} City`, channels: "Meta", brandVoice: "Plain", competitors: [{ name: "Sparkle Clean", url: "https://sparkle.example.com" }] });
  await owner.mutation(api.profile.confirm, { workspaceId });
  await owner.mutation(api.facts.record, { workspaceId, factKey: "teamSize", value: "Two-person vetted teams" });
  const projectId = await owner.mutation(api.research.createProject, { workspaceId, title: name, objective: "Which ads do competitors run?", market: "House cleaning", geography: `${name} City`, competitors: [], platforms: ["web"], suppliedUrls: [] });
  await t.run(async (ctx) => {
    const row = await ctx.db.query("modelRoutes").withIndex("by_workKind", (q) => q.eq("workKind", "write")).unique();
    if (!row) await ctx.db.insert("modelRoutes", { workKind: "write", provider: "fake", model: "fake-scripted", fallbackProvider: "fake", fallbackModel: "fake-scripted" });
  });
  const source = (platform: "metaAdLibrary" | "customerData" = "metaAdLibrary") =>
    t.run((ctx) =>
      ctx.db.insert("sourceRefs", {
        workspaceId,
        projectId,
        origin: "found",
        platform,
        kind: platform === "customerData" ? "page" : "ad",
        url: "https://www.facebook.com/ads/library/?id=111",
        canonicalUrl: "https://www.facebook.com/ads/library/?id=111",
        title: "Sparkle Clean ad",
        publisher: "Sparkle Clean",
        observedAt: 1793900000000,
        availability: "available",
        excerpt: REFERENCE_TEXT,
        classification: { hook: "Stop scrubbing your weekends away", offer: "20% off the first visit", callToAction: "Book now", format: "Short vertical video", classifiedBy: "model", classifiedAt: 1 },
      }),
    );
  const sourceRefId = await source();
  const kit = await owner.mutation(api.brandKits.saveVersion, { workspaceId, kind: "own", name: `${name} Cleaning`, tone: "Warm and plain.", avoidWords: ["cheap"], disclaimers: ["Prices vary by home size."] });
  const offer = await owner.mutation(api.offers.saveVersion, { workspaceId, ...EMPTY_OFFER, name: "First deep clean", price: "$79", included: ["Kitchen", "Bathrooms"], guarantee: "Re-clean free within 24 hours", terms: "New customers", targetCustomer: "Homeowners" });
  return { owner, workspaceId, projectId, sourceRefId, kitId: kit.kitId as Id<"brandKits">, offerCardId: offer.cardId as Id<"offerCards">, source };
}

async function finish(t: Tester, caller: Caller, workspaceId: Id<"workspaces">, runId: Id<"agentRuns">) {
  let status = "queued";
  for (let i = 0; i < 30 && (status === "queued" || status === "running"); i += 1) {
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();
    status = (await caller.query(api.runs.get, { workspaceId, runId })).status as string;
  }
  return status;
}

async function adSet(caller: Caller, workspaceId: Id<"workspaces">) {
  const tab = await caller.query(api.creative.tab, { workspaceId });
  const row = tab.results[0];
  if (!row) return null;
  return { row, view: await caller.query(api.creative.view, { workspaceId, assetId: row.id }), asset: await caller.query(api.assets.get, { workspaceId, assetId: row.id }) };
}

describe("copy comparison", () => {
  it("finds shared wording whatever the punctuation or case", () => {
    expect(longestSharedRun("Don't wait: book a sparkling clean home today!", "BOOK A SPARKLING CLEAN HOME in sixty seconds")).toEqual(["book", "a", "sparkling", "clean", "home"]);
    expect(longestSharedRun("Entirely different words here", "Nothing in common at all")).toEqual([]);
    expect(sharedPhraseShare(REFERENCE_TEXT, REFERENCE_TEXT)).toBe(1);
    expect(sharedPhraseShare("A vetted team handles the deep clean for you", REFERENCE_TEXT)).toBe(0);
    expect(containsPhrase("A Cheap way to get it", "cheap")).toBe(true);
    expect(containsPhrase("Cheaper than you think", "cheap")).toBe(false);
  });

  it("knows which sentences state something as fact, and stricter ones for regulated fields", () => {
    expect(claimSentences("We love tidy homes. Save 20% today. Rated #1 in town. Results in 14 days.", "none")).toEqual(["Save 20% today.", "Rated #1 in town.", "Results in 14 days."]);
    expect(claimSentences("Three reasons to call us. Lose weight without trying.", "none")).toEqual([]);
    expect(claimSentences("Lose weight without trying. Feel good.", "health")).toEqual(["Lose weight without trying."]);
    expect(claimSentences("Earn more from your savings.", "finance")).toEqual(["Earn more from your savings."]);
  });
});

describe("Creative Production", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel;
  });

  it("is available in the catalog and can only read, check and save", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const shell = await a.owner.query(api.workspace.shell, { workspaceId: a.workspaceId });
    expect(shell?.agents.find((row) => row.slug === AGENT)?.skills?.find((row) => row.slug === "creative-production")?.status).toBe("available");
    expect(creativeProduction.tools).toEqual(["cp.context", "cp.check", "cp.save"]);
    expect(creativeProduction.tools.filter((slug) => /publish|send|post|spend|launch|email|sms|ads\.|web\./i.test(slug))).toEqual([]);
  });

  it("makes an ad set from a reference ad and an offer: new words, backed claims, a draft a person approves", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const inputs = script();
    const options = await a.owner.query(api.creative.options, { workspaceId: a.workspaceId });
    expect(options.kits.map((row) => row.name)).toEqual(["Alpha Cleaning"]);
    expect(options.offers.map((row) => row.name)).toEqual(["First deep clean"]);
    expect(options.sources.map((row) => [row.title, row.hook])).toEqual([["Sparkle Clean ad", "Stop scrubbing your weekends away"]]);

    const started = await a.owner.mutation(api.creative.start, { workspaceId: a.workspaceId, kitId: a.kitId, sourceRefId: a.sourceRefId, offerCardId: a.offerCardId, dial: "close", note: "Lead with time saved." });
    expect((await a.owner.query(api.creative.tab, { workspaceId: a.workspaceId })).running).toHaveLength(1);
    expect(await finish(t, a.owner, a.workspaceId, started.runId)).toBe("completed");

    // One model call. The reference reaches it only as wrapped data, with the closeness rule and the brand's own rules.
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toContain("UNTRUSTED CONTENT");
    expect(inputs[0]).toContain("Close match");
    expect(inputs[0]).toContain("Words this brand never uses: cheap");
    expect(inputs[0]).toContain("Never name these businesses: Sparkle Clean");
    expect(inputs[0]).toContain("Lead with time saved.");

    const set = await adSet(a.owner, a.workspaceId);
    expect(set?.row.status).toBe("draft");
    expect(set?.row.brand).toBe("Alpha Cleaning");
    expect(set?.view?.creative?.variations.map((row) => row.key)).toEqual(["A", "B", "C", "D"]);
    expect(set?.view?.checks.passed).toBe(true);
    expect(set?.view?.dial.value).toBe("close");
    expect(set?.view?.reference?.title).toBe("Sparkle Clean ad");
    expect(set?.view?.offer).toMatchObject({ name: "First deep clean", version: 1 });
    expect(set?.view?.disclaimers).toEqual(["Prices vary by home size."]);

    const version = set!.asset;
    expect(version.body).toContain("Only the structure follows the reference.");
    expect(version.body).toContain("Prices vary by home size.");
    const evidence = version.evidence as { claimKey: string; basis: string | null; sources: { id: string }[]; sourceMissing: boolean }[];
    const keys = evidence.map((row) => row.claimKey).sort();
    expect(keys).toEqual(["brand", "claim-1", "structure", "variation-A", "variation-B", "variation-C", "variation-D"]);
    // The structure cites the reference ad; each variation is an untested hypothesis; nothing points at a missing source.
    expect(evidence.find((row) => row.claimKey === "structure")?.sources.map((row) => row.id)).toEqual([a.sourceRefId]);
    expect(evidence.filter((row) => row.claimKey.startsWith("variation-")).every((row) => row.basis === "hypothesis")).toBe(true);
    expect(evidence.some((row) => row.sourceMissing)).toBe(false);

    await a.owner.mutation(api.assets.approve, { workspaceId: a.workspaceId, assetId: set!.row.id });
    expect((await adSet(a.owner, a.workspaceId))?.row.status).toBe("approved");
  });

  it("revises a draft that repeats the reference's wording or uses a word the brand avoids", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const inputs = script({ copyReference: true, avoided: true });
    const started = await a.owner.mutation(api.creative.start, { workspaceId: a.workspaceId, kitId: a.kitId, sourceRefId: a.sourceRefId, offerCardId: a.offerCardId });
    expect(await finish(t, a.owner, a.workspaceId, started.runId)).toBe("completed");
    expect(inputs).toHaveLength(2);
    expect(inputs[1]).toContain("New words, not the reference's");
    expect(inputs[1]).toContain("On brand");
    const set = await adSet(a.owner, a.workspaceId);
    expect(set?.view?.versions).toBe(2);
    expect(set?.row.status).toBe("draft");
    expect(set?.view?.checks.passed).toBe(true);
    // Version 1 is kept, with what was wrong with it.
    const first = await a.owner.query(api.assets.version, { workspaceId: a.workspaceId, assetId: set!.row.id, version: 1 });
    expect(first.body).toContain("repeats the reference's wording");
  });

  it("holds back a creative whose claim nothing on record backs: it needs review and cannot be approved", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    script({ unbacked: true });
    const started = await a.owner.mutation(api.creative.start, { workspaceId: a.workspaceId, kitId: a.kitId, offerCardId: a.offerCardId });
    expect(await finish(t, a.owner, a.workspaceId, started.runId)).toBe("completed");
    const set = await adSet(a.owner, a.workspaceId);
    expect(set?.row.status).toBe("needsReview");
    expect(set?.view?.checks.results.find((row) => row.name === "Claims are backed")).toMatchObject({ passed: false });
    expect(set?.view?.checks.results.find((row) => row.name === "Claims are backed")?.detail).toContain("Rated #1 by 500 local families.");
    expect(await message(a.owner.mutation(api.assets.approve, { workspaceId: a.workspaceId, assetId: set!.row.id }))).toContain("did not pass its checks");
  });

  it("refuses to start without a starting point, for a Rep, from the business's own results, or across workspaces", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta");
    script();
    const base = { workspaceId: a.workspaceId, kitId: a.kitId };
    expect(await message(a.owner.mutation(api.creative.start, base))).toContain("reference ad or a saved offer");
    expect(await message(a.owner.mutation(api.creative.start, { ...base, offerCardId: a.offerCardId, dial: "identical" }))).toContain("how closely");
    expect(await message(a.owner.mutation(api.creative.start, { ...base, sourceRefId: await a.source("customerData") }))).toContain("own results cannot be a reference");
    // Another workspace's brand, reference or offer reads as not found.
    expect(await message(a.owner.mutation(api.creative.start, { workspaceId: a.workspaceId, kitId: b.kitId, offerCardId: a.offerCardId }))).toBe(NOT_FOUND);
    expect(await message(a.owner.mutation(api.creative.start, { ...base, sourceRefId: b.sourceRefId }))).toBe(NOT_FOUND);
    expect(await message(a.owner.mutation(api.creative.start, { ...base, offerCardId: b.offerCardId }))).toBe(NOT_FOUND);
    expect(await message(b.owner.query(api.creative.tab, { workspaceId: a.workspaceId }))).toBe(NOT_FOUND);

    const invite = await a.owner.mutation(api.workspace.invite, { workspaceId: a.workspaceId, email: "rep@example.com", role: "rep" });
    const rep = t.withIdentity({ ...person("rep"), email: "rep@example.com" });
    await rep.mutation(api.workspace.acceptInvite, { token: invite.token });
    expect(await message(rep.mutation(api.creative.start, { ...base, offerCardId: a.offerCardId }))).toBe(NOT_ALLOWED);

    // A put-away brand cannot be used; nothing above started a run.
    await a.owner.mutation(api.brandKits.archive, { workspaceId: a.workspaceId, kitId: a.kitId });
    expect(await message(a.owner.mutation(api.creative.start, { ...base, offerCardId: a.offerCardId }))).toContain("put away");
    expect((await a.owner.query(api.creative.tab, { workspaceId: a.workspaceId })).running).toEqual([]);

    const done = await b.owner.mutation(api.creative.start, { workspaceId: b.workspaceId, kitId: b.kitId, offerCardId: b.offerCardId });
    await finish(t, b.owner, b.workspaceId, done.runId);
    const theirs = await adSet(b.owner, b.workspaceId);
    expect(await message(a.owner.query(api.creative.view, { workspaceId: a.workspaceId, assetId: theirs!.row.id }))).toBe(NOT_FOUND);
  });
});

describe("creative checks", () => {
  const context: CreativeContext = {
    requestId: "r1",
    dial: "structure",
    note: "",
    kit: { id: "k1", kind: "own", version: 1, content: { ...EMPTY_BRAND, name: "Alpha", regulated: "health", bannedTopics: ["surgery"] } },
    reference: null,
    offer: { cardId: "c1", version: 1, content: { ...EMPTY_OFFER, name: "Plan", price: "$79", guarantee: "" } },
    profile: null,
    facts: [
      { id: "f1", factKey: "reviews", value: "4.9 stars from 212 reviews", status: "verified" },
      { id: "f2", factKey: "guess", value: "Most clients stay a year", status: "unverified" },
    ],
    outcomes: [],
    blockedNames: ["Sparkle Clean"],
  };

  it("lets a claim stand only on a verified fact, or on what the offer card itself says", () => {
    expect(claimStands({ text: "4.9 stars from 212 reviews.", support: "fact", factIds: ["f1"] }, context)).toBe(true);
    expect(claimStands({ text: "Most clients stay a year.", support: "fact", factIds: ["f2"] }, context)).toBe(false);
    expect(claimStands({ text: "Loved by everyone.", support: "fact", factIds: [] }, context)).toBe(false);
    expect(claimStands({ text: "Your plan is $79.", support: "offer", factIds: [] }, context)).toBe(true);
    expect(claimStands({ text: "Your plan is $49.", support: "offer", factIds: [] }, context)).toBe(false);
    // The card gives no guarantee, so the copy cannot promise one.
    expect(claimStands({ text: "Money-back guarantee.", support: "offer", factIds: [] }, context)).toBe(false);
    expect(claimStands({ text: "Your plan is $79.", support: "offer", factIds: [] }, { ...context, offer: null })).toBe(false);
  });

  it("names every rule a creative breaks", () => {
    const variation = (key: string, primaryText: string) => ({ key, hookType: "question", hook: `Hook ${key}`, primaryText, headline: "Headline", cta: "Book", imageDirection: "A room", hypothesis: "It wins", design: { eyebrow: "", kicker: "", accent: "", visual: "A calm room", labels: [], subline: "" } });
    const creative = readCreative({
      summary: "s",
      structure: {},
      brief: { audience: "People", promise: "Relief" },
      variations: [variation("A", "Better than Sparkle Clean."), variation("B", "Heals your back in 7 days."), variation("C", "No surgery needed."), variation("D", "x".repeat(900))],
      script: { beats: [] },
      captions: [],
      claims: [],
      limits: [],
      contextUsed: { profileVersionId: null, factIds: ["made-up"] },
    });
    const failed = runChecks({ creative, context, runCostCents: 10, capCents: 150 }).results.filter((row) => !row.passed);
    expect(failed.map((row) => row.name)).toEqual(["On brand", "Fits the placements", "Claims are backed", "Used the business context"]);
    expect(failed[0].detail).toContain("surgery");
    expect(failed[2].detail).toContain("Heals your back in 7 days.");
    expect(runChecks({ creative: null, context, runCostCents: 0, capCents: 150 }).passed).toBe(false);
  });
});
