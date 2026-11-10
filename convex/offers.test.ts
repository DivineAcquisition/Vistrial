/**
 * @vitest-environment edge-runtime
 *
 * The offer builder's server side: creating an offer, saving versions and comparing them, starting from the
 * profile or a copy, "Analyse this offer", validation in words a person can act on, roles (Owners and
 * Managers edit, Reps read) and that one workspace never reads or writes another's offers.
 */
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { EMPTY_OFFER, cleanOffer, compareOffers, itemsTotal, offerDetailsText, offerFromProfile, offerProblem, priceText, tidyAmount, type OfferInput } from "./lib/offerCards";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;
const AGENT = "growth-architect";

function person(subject: string) {
  return { subject, email: `${subject}@example.com`, name: subject, issuer: "https://clerk.vistrial.test", tokenIdentifier: `https://clerk.vistrial.test|${subject}` };
}

async function seed(t: Tester, name: string) {
  const owner = t.withIdentity(person(`${name}-owner`));
  const workspaceId = await owner.mutation(api.workspace.create, { name });
  await owner.mutation(api.workspace.setAgentState, { workspaceId, slug: AGENT, state: "on" });
  await t.run(async (ctx) => {
    await ctx.db.insert("members", { workspaceId, userId: `${name}-rep`, role: "rep", displayName: "Rep", active: true });
    await ctx.db.insert("members", { workspaceId, userId: `${name}-manager`, role: "manager", displayName: "Manager", active: true });
  });
  return { owner, rep: t.withIdentity(person(`${name}-rep`)), manager: t.withIdentity(person(`${name}-manager`)), workspaceId };
}

/** An agency's offer as the builder sends it. */
const retainer: OfferInput = {
  name: "Done-for-you lead generation retainer",
  targetCustomer: "Home-service brands doing $1M to $5M a year",
  outcome: "20 booked sales calls every month",
  price: "",
  pricing: { kind: "monthly", amount: "2500", was: "3,000", tiers: [] },
  included: [],
  items: [
    { text: "Paid ads management on Meta and Google", value: "1500" },
    { text: "Two landing pages, built and tested", value: "$2,000" },
    { text: "Weekly lead report", value: "" },
  ],
  bonuses: ["90-day content calendar"],
  guaranteeType: "results",
  guarantee: "20 booked calls in 60 days or we work free until you get them.",
  terms: "Month to month. 30-day notice.",
  cta: "Book a strategy call",
  channel: "Cold outreach",
};

/** The message a person sees: a userError's own words. */
async function problemOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ConvexError) return (error.data as { code: string; message: string }).message;
    throw error;
  }
  return null;
}

async function approveReport(t: Tester, workspaceId: Id<"workspaces">) {
  await t.run((ctx) => ctx.db.insert("assets", { workspaceId, kind: "marketReport", title: "Home-service lead generation: market report", status: "approved", currentVersion: 1, createdAt: Date.now() }));
}

describe("offer content (code)", () => {
  it("works the plain price and the plain list out of the structured fields", () => {
    const offer = cleanOffer(retainer);
    expect(offer.price).toBe("$2,500/mo");
    expect(offer.pricing).toEqual({ kind: "monthly", amount: "$2,500", was: "$3,000", tiers: [] });
    expect(offer.included).toEqual(["Paid ads management on Meta and Google", "Two landing pages, built and tested", "Weekly lead report"]);
    expect(offer.items[0]).toEqual({ text: "Paid ads management on Meta and Google", value: "$1,500" });
    expect(itemsTotal(offer.items)).toBe("$3,500");
    expect(tidyAmount("$4k setup")).toBe("$4k setup");
    expect(priceText({ kind: "oneTime", amount: "$4,000", was: "", tiers: [] })).toBe("$4,000");
    expect(priceText({ kind: "monthly", amount: "$1,500 per month", was: "", tiers: [] })).toBe("$1,500 per month");
    const tiered = cleanOffer({ ...retainer, pricing: { kind: "tiered", amount: "9", was: "9", tiers: [{ name: "Starter", price: "1500" }, { name: "Growth", price: "$2,500/mo" }, { name: "", price: "" }] } });
    expect(tiered.price).toBe("Starter $1,500 · Growth $2,500/mo");
    expect(tiered.pricing).toMatchObject({ amount: "", was: "", tiers: [{ name: "Starter", price: "$1,500" }, { name: "Growth", price: "$2,500/mo" }] });
  });

  it("reads a card from before the builder: plain price, plain list, nothing else", () => {
    const old = cleanOffer({ name: "Paid ads management", price: "$1,500/mo", included: ["Meta ads", "meta ads", " "], guarantee: "Not stated", terms: "", targetCustomer: "Roofers" });
    expect(old).toEqual({ ...EMPTY_OFFER, name: "Paid ads management", price: "$1,500/mo", included: ["Meta ads"], items: [{ text: "Meta ads", value: "" }], targetCustomer: "Roofers" });
    // "No guarantee" is a choice that leaves no guarantee text behind.
    expect(cleanOffer({ ...retainer, guaranteeType: "none" }).guarantee).toBe("");
  });

  it("compares every builder field, with line items and bonuses added and removed", () => {
    const after = { ...retainer, pricing: { kind: "monthly" as const, amount: "2000", was: "", tiers: [] }, items: [...retainer.items!.slice(0, 2), { text: "Lead follow-up by text", value: "500" }], bonuses: [], cta: "Get the plan" };
    const changes = compareOffers(retainer, after);
    expect(changes.filter((row) => row.changed).map((row) => row.field)).toEqual(["price", "was", "included", "bonuses", "cta"]);
    const included = changes.find((row) => row.field === "included");
    expect(included && "added" in included ? [included.added, included.removed] : null).toEqual([["Lead follow-up by text ($500)"], ["Weekly lead report"]]);
    expect(changes.find((row) => row.field === "price")).toMatchObject({ before: "$2,500/mo", after: "$2,000/mo" });
    expect(changes.find((row) => row.field === "guaranteeType")).toMatchObject({ before: "Results guarantee", changed: false });
    expect(compareOffers(retainer, retainer).every((row) => !row.changed)).toBe(true);
  });

  it("starts a draft from the business profile and writes the card as the owner's words", () => {
    const draft = offerFromProfile({ offer: "Done-for-you lead generation for home-service brands. We run the ads and book the calls.", priceNotes: "$2,500 a month retainer, ad spend on top", audience: "Roofers, HVAC and plumbers in Texas", channels: "Referrals, cold outreach" });
    expect(draft).toMatchObject({ name: "Done-for-you lead generation for home-service brands", price: "$2,500/mo", pricing: { kind: "monthly", amount: "$2,500" }, targetCustomer: "Roofers, HVAC and plumbers in Texas", channel: "Referrals" });
    expect(offerFromProfile({ offer: "Paid ads audit", priceNotes: "Ask us", audience: "", channels: "" })).toMatchObject({ price: "Ask us", pricing: null });
    expect(offerDetailsText(cleanOffer(retainer))).toContain("Done-for-you lead generation retainer, $2,500/mo. Outcome: 20 booked sales calls every month.");
  });

  it("names what is wrong in words a person can act on", () => {
    const check = (change: Partial<OfferInput>) => offerProblem({ ...retainer, ...change });
    expect(check({})).toBeNull();
    expect(check({ name: "  " })).toBe("Give the offer a name.");
    expect(check({ name: "x".repeat(121) })).toMatch(/under 120 characters/);
    expect(check({ pricing: { kind: "monthly", amount: "a lot", was: "", tiers: [] } })).toBe("The price needs a number, for example $2,500.");
    expect(check({ pricing: { kind: "oneTime", amount: "", was: "3000", tiers: [] } })).toBe('Add the price before its "was" price.');
    expect(check({ pricing: { kind: "monthly", amount: "2500", was: "2,000", tiers: [] } })).toBe('The "was" price should be higher than the price now.');
    expect(check({ pricing: { kind: "tiered", amount: "", was: "", tiers: [{ name: "Starter", price: "1500" }] } })).toMatch(/at least two tiers/);
    expect(check({ pricing: { kind: "tiered", amount: "", was: "", tiers: [{ name: "Starter", price: "1500" }, { name: "Growth", price: "call us" }] } })).toBe("The Growth tier needs a price with a number, for example $1,500.");
    expect(check({ pricing: { kind: "weekly" as never, amount: "5", was: "", tiers: [] } })).toBe("Choose a one-time, monthly or tiered price.");
    expect(check({ items: [{ text: "", value: "500" }] })).toMatch(/has a value but no name/);
    expect(check({ items: [{ text: "Landing pages", value: "priceless" }] })).toBe('The value of "Landing pages" should be an amount, for example $500.');
    expect(check({ items: Array.from({ length: 13 }, (_, i) => ({ text: `Item ${i}`, value: "" })) })).toBe("An offer can list up to 12 line items.");
    expect(check({ bonuses: Array.from({ length: 7 }, (_, i) => `Bonus ${i}`) })).toBe("An offer can list up to 6 bonuses.");
    expect(check({ guaranteeType: "results", guarantee: " " })).toBe("Say what the guarantee covers, or choose No guarantee.");
    expect(check({ guaranteeType: "lifetime" as never })).toBe("Choose a guarantee type from the list.");
    expect(check({ guaranteeType: "none", guarantee: "" })).toBeNull();
    expect(check({ cta: "x".repeat(81) })).toMatch(/call to action under 80/);
    // A price is optional: an offer can be saved before it is priced.
    expect(check({ pricing: { kind: "monthly", amount: "", was: "", tiers: [] } })).toBeNull();
  });
});

describe("offer builder (server)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("creates an offer with every builder field, as version 1", async () => {
    const t = makeTester();
    const a = await seed(t, "Northlight");
    const saved = await a.owner.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, ...retainer });
    expect(saved).toMatchObject({ version: 1, added: true });
    const card = await a.owner.query(api.offers.get, { workspaceId: a.workspaceId, cardId: saved.cardId });
    expect(card).toMatchObject({ name: "Done-for-you lead generation retainer", currentVersion: 1, analyses: [] });
    expect(card.versions).toHaveLength(1);
    expect(card.versions[0]).toMatchObject({
      version: 1,
      origin: "person",
      price: "$2,500/mo",
      pricing: { kind: "monthly", amount: "$2,500", was: "$3,000" },
      outcome: "20 booked sales calls every month",
      items: [{ text: "Paid ads management on Meta and Google", value: "$1,500" }, { text: "Two landing pages, built and tested", value: "$2,000" }, { text: "Weekly lead report", value: "" }],
      bonuses: ["90-day content calendar"],
      guaranteeType: "results",
      cta: "Book a strategy call",
      channel: "Cold outreach",
    });
    const rows = await a.owner.query(api.offers.list, { workspaceId: a.workspaceId });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: saved.cardId, versions: 1, current: { name: "Done-for-you lead generation retainer", price: "$2,500/mo" } });
  });

  it("saving a change makes a new version and keeps the old one; saving the same content adds nothing", async () => {
    const t = makeTester();
    const a = await seed(t, "Northlight");
    const first = await a.owner.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, ...retainer });
    vi.advanceTimersByTime(1000);
    const second = await a.manager.mutation(api.offers.saveVersion, {
      workspaceId: a.workspaceId,
      cardId: first.cardId,
      ...retainer,
      pricing: { kind: "tiered", amount: "", was: "", tiers: [{ name: "Starter", price: "1500" }, { name: "Growth", price: "2500" }] },
      bonuses: ["90-day content calendar", "Call scripts"],
      note: "Tiered pricing after the September test",
    });
    expect(second).toEqual({ cardId: first.cardId, version: 2, added: true });
    const again = await a.owner.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, cardId: first.cardId, ...retainer, pricing: { kind: "tiered", amount: "", was: "", tiers: [{ name: "Starter", price: "$1,500" }, { name: "Growth", price: "$2,500" }] }, bonuses: ["90-day content calendar", "Call scripts"] });
    expect(again).toEqual({ cardId: first.cardId, version: 2, added: false });
    const card = await a.owner.query(api.offers.get, { workspaceId: a.workspaceId, cardId: first.cardId });
    expect(card.currentVersion).toBe(2);
    expect(card.versions.map((row) => [row.version, row.price, row.note])).toEqual([
      [1, "$2,500/mo", null],
      [2, "Starter $1,500 · Growth $2,500", "Tiered pricing after the September test"],
    ]);
    // Version 1 is untouched.
    expect(card.versions[0].pricing).toMatchObject({ kind: "monthly", amount: "$2,500", was: "$3,000" });
    expect(await t.run((ctx) => ctx.db.query("offerCardVersions").collect())).toHaveLength(2);
  });

  it("compares any two versions of an offer", async () => {
    const t = makeTester();
    const a = await seed(t, "Northlight");
    const first = await a.owner.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, ...retainer });
    await a.owner.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, cardId: first.cardId, ...retainer, outcome: "30 booked sales calls every month", guaranteeType: "moneyBack", guarantee: "Your first month back if we miss it." });
    const compared = await a.rep.query(api.offers.compare, { workspaceId: a.workspaceId, cardId: first.cardId, from: 1, to: 2 });
    expect(compared.changes.filter((row) => row.changed).map((row) => row.field)).toEqual(["outcome", "guaranteeType", "guarantee"]);
    expect(compared.changes.find((row) => row.field === "guaranteeType")).toMatchObject({ before: "Results guarantee", after: "Money-back guarantee" });
    expect(compared).toMatchObject({ from: { version: 1 }, to: { version: 2 } });
    await expect(a.owner.query(api.offers.compare, { workspaceId: a.workspaceId, cardId: first.cardId, from: 1, to: 9 })).rejects.toThrow(/Not found/);
  });

  it("starts from the business profile, or from a copy of an existing offer", async () => {
    const t = makeTester();
    const a = await seed(t, "Northlight");
    expect(await a.owner.query(api.offers.starter, { workspaceId: a.workspaceId })).toEqual({ profile: null });
    await t.run((ctx) =>
      ctx.db.insert("profileVersions", { workspaceId: a.workspaceId, version: 1, offer: "Paid ads management for home-service brands", priceNotes: "$1,500/mo plus ad spend", audience: "Roofers and HVAC companies", geography: "Texas", channels: "Referrals, cold email", brandVoice: "", competitors: [], status: "confirmed" }),
    );
    const starter = await a.rep.query(api.offers.starter, { workspaceId: a.workspaceId });
    expect(starter.profile).toMatchObject({ confirmed: true, offer: { name: "Paid ads management for home-service brands", price: "$1,500/mo", targetCustomer: "Roofers and HVAC companies", channel: "Referrals" } });

    const original = await a.owner.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, ...retainer });
    const copy = await a.owner.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, ...retainer, name: "Lead generation retainer for dental practices", copyOf: original.cardId });
    expect(copy.cardId).not.toBe(original.cardId);
    const copied = await a.owner.query(api.offers.get, { workspaceId: a.workspaceId, cardId: copy.cardId });
    expect(copied.versions[0]).toMatchObject({ version: 1, name: "Lead generation retainer for dental practices", note: "Copied from Done-for-you lead generation retainer", cta: "Book a strategy call" });
    // The original keeps its one version.
    expect((await a.owner.query(api.offers.get, { workspaceId: a.workspaceId, cardId: original.cardId })).versions).toHaveLength(1);
    expect((await t.run((ctx) => ctx.db.get(copy.cardId)))?.copiedFrom).toBe(original.cardId);
  });

  it("refuses bad content with the person-facing message, and stores nothing", async () => {
    const t = makeTester();
    const a = await seed(t, "Northlight");
    const save = (change: Partial<OfferInput> & { note?: string }) => problemOf(a.owner.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, ...retainer, ...change }));
    expect(await save({ name: " " })).toBe("Give the offer a name.");
    expect(await save({ pricing: { kind: "monthly", amount: "2500", was: "1000", tiers: [] } })).toBe('The "was" price should be higher than the price now.');
    expect(await save({ pricing: { kind: "tiered", amount: "", was: "", tiers: [{ name: "Only", price: "100" }] } })).toMatch(/at least two tiers/);
    expect(await save({ pricing: { kind: "yearly" as never, amount: "1", was: "", tiers: [] } })).toBe("Choose a one-time, monthly or tiered price.");
    expect(await save({ items: [{ text: "Landing pages", value: "lots" }] })).toMatch(/should be an amount/);
    expect(await save({ guaranteeType: "moneyBack", guarantee: "" })).toBe("Say what the guarantee covers, or choose No guarantee.");
    expect(await save({ note: "n".repeat(301) })).toBe("Keep the note under 300 characters.");
    expect(await t.run((ctx) => ctx.db.query("offerCards").collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("offerCardVersions").collect())).toHaveLength(0);
    // The error is a userError (code "invalid"), so production shows its words rather than "Server Error".
    await expect(a.owner.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, ...retainer, name: "" })).rejects.toMatchObject({ data: { code: "invalid", message: "Give the offer a name." } });
  });

  it("Owners and Managers edit; Reps read", async () => {
    const t = makeTester();
    const a = await seed(t, "Northlight");
    await approveReport(t, a.workspaceId);
    await expect(a.rep.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, ...retainer })).rejects.toMatchObject({ data: { code: "not_allowed" } });
    const saved = await a.manager.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, ...retainer });
    await expect(a.rep.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, cardId: saved.cardId, ...retainer, cta: "Call now" })).rejects.toMatchObject({ data: { code: "not_allowed" } });
    await expect(a.rep.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, ...retainer, copyOf: saved.cardId })).rejects.toMatchObject({ data: { code: "not_allowed" } });
    await expect(a.rep.mutation(api.offerRuns.analyse, { workspaceId: a.workspaceId, cardId: saved.cardId })).rejects.toMatchObject({ data: { code: "not_allowed" } });
    await expect(a.rep.mutation(api.offers.archive, { workspaceId: a.workspaceId, cardId: saved.cardId })).rejects.toMatchObject({ data: { code: "not_allowed" } });
    // A Rep reads the offer, its versions and the comparison.
    expect((await a.rep.query(api.offers.list, { workspaceId: a.workspaceId })).map((row) => row.id)).toEqual([saved.cardId]);
    expect((await a.rep.query(api.offers.get, { workspaceId: a.workspaceId, cardId: saved.cardId })).versions).toHaveLength(1);
    // Nothing a Rep tried was stored or started.
    expect(await t.run((ctx) => ctx.db.query("offerCardVersions").collect())).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("agentRuns").collect())).toHaveLength(0);
    // Owners and Managers can both put an offer away.
    await a.manager.mutation(api.offers.archive, { workspaceId: a.workspaceId, cardId: saved.cardId });
    expect(await a.owner.query(api.offers.list, { workspaceId: a.workspaceId })).toEqual([]);
    expect(await problemOf(a.owner.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, cardId: saved.cardId, ...retainer, cta: "Call now" }))).toMatch(/put away/);
  });

  it("keeps workspaces apart: no reading, versioning, copying, analysing or archiving another workspace's offer", async () => {
    const t = makeTester();
    const a = await seed(t, "Northlight");
    const b = await seed(t, "Rival");
    await approveReport(t, b.workspaceId);
    const saved = await a.owner.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, ...retainer });
    const cardId = saved.cardId as Id<"offerCards">;
    expect(await b.owner.query(api.offers.list, { workspaceId: b.workspaceId })).toEqual([]);
    await expect(b.owner.query(api.offers.get, { workspaceId: b.workspaceId, cardId })).rejects.toThrow(/Not found/);
    await expect(b.owner.query(api.offers.compare, { workspaceId: b.workspaceId, cardId, from: 1, to: 1 })).rejects.toThrow(/Not found/);
    await expect(b.owner.mutation(api.offers.saveVersion, { workspaceId: b.workspaceId, cardId, ...retainer, cta: "Hijacked" })).rejects.toThrow(/Not found/);
    await expect(b.owner.mutation(api.offers.saveVersion, { workspaceId: b.workspaceId, ...retainer, copyOf: cardId })).rejects.toThrow(/Not found/);
    await expect(b.owner.mutation(api.offerRuns.analyse, { workspaceId: b.workspaceId, cardId })).rejects.toThrow(/Not found/);
    await expect(b.owner.mutation(api.offers.archive, { workspaceId: b.workspaceId, cardId })).rejects.toThrow(/Not found/);
    // Nor by naming the other workspace: B's people are not members of A.
    await expect(b.owner.query(api.offers.list, { workspaceId: a.workspaceId })).rejects.toThrow();
    await expect(b.owner.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, ...retainer })).rejects.toThrow();
    // A's offer is exactly as A left it, and B has none.
    const card = await a.owner.query(api.offers.get, { workspaceId: a.workspaceId, cardId });
    expect(card.versions).toHaveLength(1);
    expect(card.versions[0].cta).toBe("Book a strategy call");
    expect(await t.run(async (ctx) => (await ctx.db.query("offerCards").collect()).map((row) => row.workspaceId))).toEqual([a.workspaceId]);
    expect((await a.owner.query(api.offers.starter, { workspaceId: a.workspaceId })).profile).toBeNull();
  });

  it("Analyse this offer runs Offer Intelligence on the saved version and links the result to the card", async () => {
    const t = makeTester();
    const a = await seed(t, "Northlight");
    const saved = await a.owner.mutation(api.offers.saveVersion, { workspaceId: a.workspaceId, ...retainer });
    // It builds only on approved research.
    expect(await problemOf(a.owner.mutation(api.offerRuns.analyse, { workspaceId: a.workspaceId, cardId: saved.cardId }))).toMatch(/Approve a market report first/);
    expect(await t.run((ctx) => ctx.db.query("agentRuns").collect())).toHaveLength(0);
    await approveReport(t, a.workspaceId);
    const started = await a.owner.mutation(api.offerRuns.analyse, { workspaceId: a.workspaceId, cardId: saved.cardId });
    expect(started.version).toBe(1);
    const run = await t.run((ctx) => ctx.db.get(started.runId));
    expect(run).toMatchObject({ skillSlug: "offer-intelligence", agentSlug: AGENT, workspaceId: a.workspaceId });
    // The saved offer is what the analysis reads as the owner's words.
    const facts = await a.owner.query(api.facts.list, { workspaceId: a.workspaceId });
    expect(facts.find((row) => row.factKey === "offerDetails")?.value).toContain("Done-for-you lead generation retainer, $2,500/mo");
    let card = await a.owner.query(api.offers.get, { workspaceId: a.workspaceId, cardId: saved.cardId });
    expect(card.analyses).toEqual([{ runId: started.runId, version: 1, at: expect.any(Number), state: "running", assetId: null, assetStatus: null }]);
    // One at a time.
    expect(await problemOf(a.owner.mutation(api.offerRuns.analyse, { workspaceId: a.workspaceId, cardId: saved.cardId }))).toBe("An analysis of this offer is already running.");
    // The run finishes and saves its analysis: the card now points at it.
    const assetId = await t.run(async (ctx) => {
      await ctx.db.patch(started.runId, { status: "completed", finishedAt: Date.now() });
      return ctx.db.insert("assets", { workspaceId: a.workspaceId, kind: "offerAnalysis", title: "Offer analysis: Lead generation retainer", status: "draft", currentVersion: 1, createdByRun: started.runId, createdAt: Date.now() });
    });
    card = await a.owner.query(api.offers.get, { workspaceId: a.workspaceId, cardId: saved.cardId });
    expect(card.analyses[0]).toMatchObject({ state: "done", assetId, assetStatus: "draft", version: 1 });
  });
});
