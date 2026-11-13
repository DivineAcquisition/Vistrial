/**
 * @vitest-environment edge-runtime
 *
 * Site capture: reading a business's website for its brand, offers and pages, every item with where it was
 * found, and nothing used until a person applies it. The web and the model are scripted: no real site and
 * no real model is called here.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { extractPage } from "./lib/pageReader/extract";
import type { RawResponse } from "./lib/pageReader/read";
import { brandColors, brandFonts, familiesFromLink, firstFamily, isNeutral, nameFromTitles, structuredFacts, toHex } from "./lib/siteCapture/brand";
import { originWords, parseResult } from "./lib/siteCapture/fields";
import { choosePages, purposeOf, teardownPick } from "./lib/siteCapture/pages";
import { SAMPLE_ABOUT, SAMPLE_BOOK, SAMPLE_CSS, SAMPLE_GUIDE, SAMPLE_HOME, SAMPLE_LOGO, SAMPLE_PRICING, SAMPLE_SITE, SAMPLE_WORDS } from "./lib/siteCapture/sample";
import { normal, verifyWords } from "./lib/siteCapture/words";
import type { ScriptedModel } from "./lib/toolRouter";
import type { ScriptedPages } from "./pageReadActions";
import schema from "./schema";
import { homeOf, progressOf } from "./siteCapture";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;
type Globals = { __vistrialScriptedPages?: ScriptedPages; __vistrialScriptedRenderer?: null; __vistrialScriptedModel?: ScriptedModel };

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

const respond = (text: string | Uint8Array, extra: Partial<RawResponse> = {}): RawResponse => {
  const body = typeof text === "string" ? new TextEncoder().encode(text) : text;
  return { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body, truncated: false, wireBytes: body.byteLength, address: "93.184.216.34", ...extra };
};

/** The sample coaching site, a site that robots.txt closes, and a record of every request. */
function web(options: { closed?: boolean } = {}) {
  const requested: string[] = [];
  (globalThis as Globals).__vistrialScriptedPages = (url) => {
    requested.push(url.href);
    if (url.pathname === "/robots.txt") return options.closed ? respond("User-agent: *\nDisallow: /", { headers: { "content-type": "text/plain" } }) : respond("", { status: 404 });
    if (url.hostname !== "northbound-coaching.example.com") return respond("", { status: 404 });
    const pages: Record<string, RawResponse> = {
      "/": respond(SAMPLE_HOME),
      "/pricing": respond(SAMPLE_PRICING),
      "/book": respond(SAMPLE_BOOK),
      "/free-guide": respond(SAMPLE_GUIDE),
      "/about": respond(SAMPLE_ABOUT),
      "/assets/site.css": respond(SAMPLE_CSS, { headers: { "content-type": "text/css" } }),
      "/logo.png": respond(SAMPLE_LOGO, { headers: { "content-type": "image/png" } }),
    };
    return pages[url.pathname] ?? respond("", { status: 404 });
  };
  (globalThis as Globals).__vistrialScriptedRenderer = null;
  return requested;
}

function model(answer: unknown) {
  const calls: string[] = [];
  (globalThis as Globals).__vistrialScriptedModel = (params) => {
    calls.push(JSON.stringify(params.messages));
    return { text: JSON.stringify(answer) };
  };
  return calls;
}

async function routes(t: Tester) {
  await t.run(async (ctx) => {
    await ctx.db.insert("modelRoutes", { workKind: "classify", provider: "fake", model: "fake-scripted", fallbackProvider: "fake", fallbackModel: "fake-scripted" });
  });
}

async function seed(t: Tester, name: string) {
  const owner = t.withIdentity(person(`${name}-owner`));
  const workspaceId = await owner.mutation(api.workspace.create, { name });
  return { owner, workspaceId };
}

async function settle(t: Tester) {
  for (let i = 0; i < 40; i += 1) {
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
  }
}

describe("what code finds on a site", () => {
  const home = extractPage(SAMPLE_HOME, SAMPLE_SITE);

  it("keeps the brand signals of a page without showing them as page text", () => {
    expect(home.brand).toMatchObject({
      themeColor: "#1f6f5c",
      ogImage: "https://northbound-coaching.example.com/share.jpg",
      icons: ["https://northbound-coaching.example.com/touch.png"],
      fontLinks: ["https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=Inter:wght@400;600&display=swap"],
      stylesheets: ["https://northbound-coaching.example.com/assets/site.css"],
    });
    expect(home.brand?.logoImages[0]).toMatchObject({ src: "https://northbound-coaching.example.com/logo.png", why: "named", region: "header" });
    expect(home.brand?.css).toContain("--brand-primary: #1f6f5c");
    expect(home.brand?.jsonLd).toHaveLength(1);
    // Styles and structured data are never read as words on the page.
    expect(home.blocks.some((block) => "text" in block && /brand-primary|schema\.org/.test(block.text))).toBe(false);
  });

  it("chooses the pages that sell, book and capture leads, skips legal pages, and records the booking tool without reading it", () => {
    const chosen = choosePages(home, SAMPLE_SITE);
    expect(chosen.read.map((row) => [new URL(row.url).pathname, row.kind])).toEqual([
      ["/book", "booking"],
      ["/pricing", "pricing"],
      ["/free-guide", "optin"],
      ["/about", "about"],
    ]);
    const withTool = extractPage(SAMPLE_HOME.replace('href="/book">Book a call', 'href="https://calendly.com/northbound/intro">Book a call'), SAMPLE_SITE);
    expect(choosePages(withTool, SAMPLE_SITE).booking.map((row) => row.url)).toEqual(["https://calendly.com/northbound/intro"]);
  });

  it("says what a read page is for from what is on it", () => {
    expect(purposeOf(extractPage(SAMPLE_BOOK, `${SAMPLE_SITE}book`), `${SAMPLE_SITE}book`, "other")).toBe("booking");
    expect(purposeOf(extractPage(SAMPLE_GUIDE, `${SAMPLE_SITE}free-guide`), `${SAMPLE_SITE}free-guide`, "other")).toBe("optin");
    expect(purposeOf(extractPage(SAMPLE_PRICING, `${SAMPLE_SITE}offer`), `${SAMPLE_SITE}offer`, "other")).toBe("sales");
    const pages = [
      { kind: "about" as const, read: true },
      { kind: "booking" as const, read: true },
      { kind: "home" as const, read: true },
      { kind: "sales" as const, read: false },
    ];
    expect(teardownPick(pages).map((row) => row.kind)).toEqual(["home", "booking", "about"]);
  });

  it("finds brand colours and fonts, leaving greys, white and black out", () => {
    expect(toHex("#ABC")).toBe("#aabbcc");
    expect(toHex("rgb(31, 111, 92)")).toBe("#1f6f5c");
    expect(toHex("rgba(0,0,0,0.1)")).toBeNull();
    expect(isNeutral("#777777")).toBe(true);
    expect(isNeutral("#1f6f5c")).toBe(false);
    const colors = brandColors({ value: "#1f6f5c", url: SAMPLE_SITE, pageId: "p1" }, [
      { css: home.brand!.css, url: SAMPLE_SITE, pageId: "p1", how: "page text" },
      { css: SAMPLE_CSS, url: `${SAMPLE_SITE}assets/site.css`, pageId: "p1", how: "stylesheet" },
    ]);
    expect(colors.colors).toEqual([
      { hex: "#1f6f5c", label: "Set as your site's theme colour" },
      { hex: "#e8a33d", label: 'Your "accent" colour' },
    ]);
    expect(firstFamily('"Inter", -apple-system, sans-serif')).toBe("Inter");
    expect(firstFamily("Arial, sans-serif")).toBeNull();
    expect(familiesFromLink(home.brand!.fontLinks[0])).toEqual(["Fraunces", "Inter"]);
    const fonts = brandFonts([], [{ css: home.brand!.css, url: SAMPLE_SITE, pageId: "p1", how: "page text" }]);
    expect([fonts.heading?.name, fonts.body?.name]).toEqual(["Fraunces", "Inter"]);
  });

  it("reads the site's structured data and the name its titles share", () => {
    const facts = structuredFacts(home.brand!.jsonLd, SAMPLE_SITE);
    expect(facts).toEqual({
      name: "Northbound Coaching",
      logo: "https://northbound-coaching.example.com/logo.png",
      sameAs: ["https://www.instagram.com/northboundcoaching", "https://www.linkedin.com/company/northbound-coaching"],
      address: "Leeds, UK",
    });
    expect(structuredFacts(["not json", '{"@type":"WebPage","name":"x"}'], SAMPLE_SITE).name).toBeNull();
    expect(nameFromTitles(["Pricing | Northbound Coaching", "About | Northbound Coaching"])).toBe("Northbound Coaching");
  });
});

describe("what the model may say about a site", () => {
  const pages = [
    { id: "p1", url: SAMPLE_SITE, snapshot: extractPage(SAMPLE_HOME, SAMPLE_SITE) },
    { id: "p3", url: `${SAMPLE_SITE}pricing`, snapshot: extractPage(SAMPLE_PRICING, `${SAMPLE_SITE}pricing`) },
    { id: "p4", url: `${SAMPLE_SITE}free-guide`, snapshot: extractPage(SAMPLE_GUIDE, `${SAMPLE_SITE}free-guide`) },
    { id: "p5", url: `${SAMPLE_SITE}about`, snapshot: extractPage(SAMPLE_ABOUT, `${SAMPLE_SITE}about`) },
  ];

  it("keeps only what the pages say, word for word, and drops the rest", () => {
    const words = verifyWords(SAMPLE_WORDS, pages);
    // An offer the site does not name, a price it does not state, an item it does not list, a quote not on the page, a proof claim not there.
    expect(words.dropped).toBe(5);
    expect(words.offers.value).toEqual([
      {
        name: "Agency Growth Program",
        price: "$2,500",
        included: ["Weekly group coaching calls", "Hiring and delivery playbooks", "Private community"],
        guarantee: "",
        terms: "or three payments of $900",
        pageId: "p3",
        quote: "Twelve weeks of coaching for agency owners. $2,500 paid in full, or three payments of $900.",
      },
      { name: "The Retainer Roadmap", price: "", included: [], guarantee: "", terms: "", pageId: "p4", quote: "A free guide to turning one-off projects into monthly retainers." },
    ]);
    expect(words.proof.value?.map((row) => row.text)).toEqual(["A client grew from 6 to 14 retainers"]);
    expect(words.tone).toMatchObject({ basis: "reading", origin: "site" });
    expect(words.tone.value?.quotes).toHaveLength(2);
    expect(words.audience).toMatchObject({ value: "agency owners doing $20k a month", basis: "stated" });
    expect(words.guarantees.sources[0]).toMatchObject({ pageId: "p1", how: "page text" });
  });

  it("returns nothing, not a guess, when the answer is empty or broken", () => {
    const words = verifyWords("nonsense", pages);
    expect(words.offers.origin).toBe("missing");
    expect(words.tone.origin).toBe("missing");
    expect(verifyWords({ name: { text: "Acme", pageId: "p9", quote: "Acme" } }, pages).name.origin).toBe("missing");
    expect(normal("Don’t  add two — retainers")).toBe("don't add two - retainers");
  });

  it("labels each field by where it came from", () => {
    const capturedPages = [{ id: "p3", kind: "pricing" as const }];
    expect(originWords({ origin: "missing", basis: "stated", sources: [] })).toBe("Not on your site");
    expect(originWords({ origin: "site", basis: "reading", sources: [] })).toBe("Vistrial's reading of your site");
    expect(originWords({ origin: "site", basis: "stated", sources: [{ url: "x", pageId: "p3", how: "page text" }] }, capturedPages)).toBe("From your site · Pricing page");
    expect(originWords({ origin: "person", basis: "stated", sources: [] })).toBe("You set this");
  });
});

describe("a site capture", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Globals).__vistrialScriptedPages;
    delete (globalThis as Globals).__vistrialScriptedRenderer;
    delete (globalThis as Globals).__vistrialScriptedModel;
    delete process.env.AUTUMN_SECRET_KEY;
  });

  it("takes a typed address to the site's home page", () => {
    expect(homeOf("northbound-coaching.example.com/pricing?x=1")).toBe(SAMPLE_SITE);
    expect(homeOf("http://localhost:3000")).toBeNull();
    expect(homeOf("not a site")).toBeNull();
  });

  it("reads the organization's site once for free, finds its brand, offers and pages, and changes nothing until applied", async () => {
    const t = makeTester();
    await routes(t);
    const a = await seed(t, "Northbound");
    const requested = web();
    const calls = model(SAMPLE_WORDS);

    expect(await a.owner.query(api.siteCapture.quote, { workspaceId: a.workspaceId })).toMatchObject({ free: true, maxCredits: 0, canStart: true });
    expect(await message(a.owner.mutation(api.siteCapture.start, { workspaceId: a.workspaceId, url: "http://10.0.0.1" }))).toMatch(/website address/);
    const captureId = await a.owner.mutation(api.siteCapture.start, { workspaceId: a.workspaceId, url: "northbound-coaching.example.com" });
    const reading = await a.owner.query(api.siteCapture.get, { workspaceId: a.workspaceId, captureId });
    expect(reading.progress.map((row) => row.state)).toEqual(["active", "waiting", "waiting", "waiting"]);
    await settle(t);

    const done = await a.owner.query(api.siteCapture.latest, { workspaceId: a.workspaceId });
    expect(done?.status).toBe("done");
    expect(done?.progress.every((row) => row.state === "done")).toBe(true);
    expect(done?.pages.map((page) => [page.id, page.kind, page.read])).toEqual([
      ["p1", "home", true],
      ["p2", "booking", true],
      ["p3", "pricing", true],
      ["p4", "optin", true],
      ["p5", "about", true],
    ]);
    const result = done!.result!;
    expect(result.name).toMatchObject({ value: "Northbound Coaching", origin: "site" });
    expect(result.colors.value?.map((row) => row.hex)).toEqual(["#1f6f5c", "#e8a33d"]);
    expect([result.headingFont.value, result.bodyFont.value]).toEqual(["Fraunces", "Inter"]);
    expect(result.logo.value?.storageId).toBeTruthy();
    expect(result.location).toMatchObject({ value: "Leeds, UK", sources: [{ how: "structured data" }] });
    expect(result.social.value?.map((row) => row.host)).toEqual(["Instagram", "LinkedIn"]);
    expect(result.offers.value?.map((row) => [row.name, row.price])).toEqual([
      ["Agency Growth Program", "$2,500"],
      ["The Retainer Roadmap", ""],
    ]);
    expect(result.dropped).toBe(5);
    expect(done?.logoUrl).toBeTruthy();

    // One model call, on page text wrapped as untrusted. No page was read twice; robots.txt was asked first.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("UNTRUSTED");
    expect(requested[0]).toBe("https://northbound-coaching.example.com/robots.txt");
    expect(requested.filter((url) => url === SAMPLE_SITE)).toHaveLength(1);
    expect(requested).not.toContain("https://northbound-coaching.example.com/privacy");

    // Free: nothing charged, and the page jobs charged nothing either.
    const ledger = await t.run((ctx) => ctx.db.query("billingLedger").collect());
    expect(ledger).toHaveLength(0);
    // Nothing changed in the brand, the offers or the facts yet.
    const before = await t.run(async (ctx) => ({ kits: (await ctx.db.query("brandKits").collect()).length, cards: (await ctx.db.query("offerCards").collect()).length, facts: (await ctx.db.query("businessFacts").collect()).length }));
    expect(before).toEqual({ kits: 0, cards: 0, facts: 0 });

    // The next capture of the same site is not free.
    expect(await a.owner.query(api.siteCapture.quote, { workspaceId: a.workspaceId })).toMatchObject({ free: false, maxCredits: 150 });
  });

  it("applies what a person chooses: a brand kit version marked as from the site, offers as cards, facts with their source", async () => {
    const t = makeTester();
    await routes(t);
    const a = await seed(t, "Northbound");
    web();
    model(SAMPLE_WORDS);
    const captureId = await a.owner.mutation(api.siteCapture.start, { workspaceId: a.workspaceId, url: SAMPLE_SITE });
    await settle(t);

    expect(await message(a.owner.mutation(api.siteCapture.apply, { workspaceId: a.workspaceId, captureId, take: ["logo"], logoOwned: false }))).toBe("Confirm that this business owns this logo or may use it.");
    await a.owner.mutation(api.siteCapture.apply, {
      workspaceId: a.workspaceId,
      captureId,
      take: ["logo", "colors", "headingFont", "bodyFont", "tone", "offers", "audience", "location", "guarantees"],
      logoOwned: true,
      edits: { bodyFont: "Source Sans 3" },
      offers: [0],
    });
    const kits = await a.owner.query(api.brandKits.list, { workspaceId: a.workspaceId });
    expect(kits).toHaveLength(1);
    expect(kits[0]).toMatchObject({ kind: "own", name: "Northbound Coaching", colors: [{ hex: "#1f6f5c" }, { hex: "#e8a33d" }] });
    const kit = await a.owner.query(api.brandKits.get, { workspaceId: a.workspaceId, kitId: kits[0].id });
    expect(kit.versions[0]).toMatchObject({ headingFont: "Fraunces", bodyFont: "Source Sans 3", logosOwned: true, website: "https://northbound-coaching.example.com", note: "From your website, with your corrections" });
    expect(kit.versions[0].logos).toHaveLength(1);
    const stored = await t.run((ctx) => ctx.db.query("brandKitVersions").first());
    expect(stored).toMatchObject({ origin: "site", captureId });

    const cards = await t.run((ctx) => ctx.db.query("offerCardVersions").collect());
    expect(cards.map((row) => [row.name, row.price, row.origin])).toEqual([["Agency Growth Program", "$2,500", "site"]]);
    const facts = await t.run((ctx) => ctx.db.query("businessFacts").collect());
    expect(facts.find((row) => row.factKey === "audience")).toMatchObject({ value: "agency owners doing $20k a month", sourceType: "site", sourceReference: captureId, status: "unverified" });
    expect(facts.find((row) => row.factKey === "researchGeography")).toMatchObject({ value: "Leeds, UK", sourceType: "site" });

    // Applying again adds a version only for the brand and no second card for the same offer.
    await a.owner.mutation(api.siteCapture.apply, { workspaceId: a.workspaceId, captureId, take: ["offers"], logoOwned: false });
    expect((await t.run((ctx) => ctx.db.query("offerCards").collect())).map((row) => row.name)).toEqual(["Agency Growth Program", "The Retainer Roadmap"]);
  });

  it("stops at a site that asks crawlers to stay out, and says why", async () => {
    const t = makeTester();
    await routes(t);
    const a = await seed(t, "Closed");
    const requested = web({ closed: true });
    const calls = model(SAMPLE_WORDS);
    await a.owner.mutation(api.siteCapture.start, { workspaceId: a.workspaceId, url: SAMPLE_SITE });
    await settle(t);
    const row = await a.owner.query(api.siteCapture.latest, { workspaceId: a.workspaceId });
    expect(row).toMatchObject({ status: "failed", reason: "This site's robots.txt asks crawlers not to open this page, so Vistrial did not.", result: null });
    expect(requested).toEqual(["https://northbound-coaching.example.com/robots.txt"]);
    expect(calls).toHaveLength(0);
  });

  it("reads a client's site on the organization's credits, after checking they cover it, and keeps it to the people who see that client", async () => {
    const t = makeTester();
    await routes(t);
    const a = await seed(t, "Agency");
    web();
    model(SAMPLE_WORDS);
    const clientId = (await a.owner.mutation(api.clients.create, { workspaceId: a.workspaceId, type: "business", name: "Northbound Coaching" })) as Id<"clients">;

    process.env.AUTUMN_SECRET_KEY = "test_key";
    await t.run((ctx) => ctx.db.insert("billingAccounts", { workspaceId: a.workspaceId, balanceCents: 100, refreshedAt: 1 }));
    expect(await a.owner.query(api.siteCapture.quote, { workspaceId: a.workspaceId, clientId })).toMatchObject({ free: false, maxCredits: 150, canAfford: false });
    expect(await message(a.owner.mutation(api.siteCapture.start, { workspaceId: a.workspaceId, url: SAMPLE_SITE, clientId }))).toMatch(/credits/i);

    await t.run(async (ctx) => {
      const account = await ctx.db.query("billingAccounts").first();
      await ctx.db.patch(account!._id, { balanceCents: 5000 });
    });
    const captureId = await a.owner.mutation(api.siteCapture.start, { workspaceId: a.workspaceId, url: SAMPLE_SITE, clientId });
    await settle(t);
    const row = await a.owner.query(api.siteCapture.get, { workspaceId: a.workspaceId, captureId });
    expect(row.status).toBe("done");
    const ledger = await t.run((ctx) => ctx.db.query("billingLedger").collect());
    expect(ledger).toHaveLength(1);
    // The organization's own site was not read, so the client's capture is not "the latest" for the organization.
    expect(await a.owner.query(api.siteCapture.latest, { workspaceId: a.workspaceId })).toBeNull();

    await a.owner.mutation(api.siteCapture.apply, { workspaceId: a.workspaceId, captureId, take: ["colors", "audience", "location", "offers"], logoOwned: false });
    const kits = await t.run((ctx) => ctx.db.query("brandKits").collect());
    expect(kits).toMatchObject([{ kind: "client", clientId }]);
    const client = await t.run((ctx) => ctx.db.get(clientId));
    expect(client?.business).toMatchObject({ website: SAMPLE_SITE, audience: "agency owners doing $20k a month", geography: "Leeds, UK", offer: "Agency Growth Program" });
    expect(await t.run((ctx) => ctx.db.query("businessFacts").collect())).toHaveLength(0);

    // A Member not assigned to this client cannot see its capture.
    const member = t.withIdentity(person("agency-member"));
    await t.run(async (ctx) => {
      await ctx.db.insert("members", { workspaceId: a.workspaceId, userId: "agency-member", role: "member", active: true, displayName: "M" });
    });
    expect(await message(member.query(api.siteCapture.get, { workspaceId: a.workspaceId, captureId }))).toBe("Not found.");
  });

  it("reads a client's website the moment it is added, when the credits cover it", async () => {
    const t = makeTester();
    await routes(t);
    const a = await seed(t, "Agency");
    web();
    model(SAMPLE_WORDS);
    const business = { website: "northbound-coaching.example.com", industry: "Coaching", offer: "", audience: "", geography: "", notes: "" };
    process.env.AUTUMN_SECRET_KEY = "test_key";
    // No credits: the client is added, the site is not read.
    const poor = (await a.owner.mutation(api.clients.create, { workspaceId: a.workspaceId, type: "business", name: "Poor Client", business })) as Id<"clients">;
    await settle(t);
    expect(await a.owner.query(api.siteCapture.latest, { workspaceId: a.workspaceId, clientId: poor })).toBeNull();

    await t.run((ctx) => ctx.db.insert("billingAccounts", { workspaceId: a.workspaceId, balanceCents: 5000, refreshedAt: 1 }));
    const clientId = (await a.owner.mutation(api.clients.create, { workspaceId: a.workspaceId, type: "business", name: "Northbound Coaching", business })) as Id<"clients">;
    await settle(t);
    expect(await a.owner.query(api.siteCapture.latest, { workspaceId: a.workspaceId, clientId })).toMatchObject({ status: "done", url: SAMPLE_SITE });
    // Adding the website later reads it then (once the site's own rate limit has room again).
    vi.advanceTimersByTime(120_000);
    await a.owner.mutation(api.clients.update, { workspaceId: a.workspaceId, clientId: poor, business: { ...business, website: "https://northbound-coaching.example.com/about" } });
    await settle(t);
    expect(await a.owner.query(api.siteCapture.latest, { workspaceId: a.workspaceId, clientId: poor })).toMatchObject({ status: "done" });
  });

  it("shows progress page by page", () => {
    const pages = [
      { id: "p1", url: SAMPLE_SITE, kind: "home", title: "", read: true },
      { id: "p2", url: `${SAMPLE_SITE}book`, kind: "booking", title: "", read: false },
      { id: "p3", url: `${SAMPLE_SITE}pricing`, kind: "pricing", title: "", read: false },
      { id: "b1", url: "https://calendly.com/x", kind: "booking", title: "", read: false },
    ];
    const rows = progressOf({ step: "pages", status: "reading", pages }, 1);
    expect(rows.map((row) => [row.label, row.state])).toEqual([
      ["Opening your home page", "done"],
      ["Reading your pages (1 of 2)", "active"],
      ["Finding your logo, colours and fonts", "waiting"],
      ["Reading your offers, prices and tone of voice", "waiting"],
    ]);
    expect(parseResult("{")).toBeNull();
  });
});
