/**
 * @vitest-environment edge-runtime
 *
 * The page reader as a workspace uses it: the plan and price before anything is opened, who may start a job,
 * what is charged, the hold on credit while a job runs, the per-site rate limit and workspace isolation. The
 * network is scripted; the rules a single read obeys are tested in lib/pageReader.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { NOT_ALLOWED, NOT_FOUND } from "./lib/errors";
import { FetchFailure, type RawResponse, type Renderer } from "./lib/pageReader/read";
import { SAMPLE_PAGE_HTML, SAMPLE_PAGE_URL } from "./lib/pageReader/sample";
import type { ScriptedPages } from "./pageReadActions";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof makeTester>;
type Globals = { __vistrialScriptedPages?: ScriptedPages; __vistrialScriptedRenderer?: Renderer | null };

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

async function seed(t: Tester, name: string) {
  const owner = t.withIdentity(person(`${name}-owner`));
  const workspaceId = await owner.mutation(api.workspace.create, { name });
  return { owner, workspaceId };
}

async function settle(t: Tester) {
  for (let i = 0; i < 30; i += 1) {
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
  }
}

async function fund(t: Tester, workspaceId: Id<"workspaces">, balanceCents: number) {
  await t.run((ctx) => ctx.db.insert("billingAccounts", { workspaceId, balanceCents, refreshedAt: 1 }));
}

const page = (text: string, extra: Partial<RawResponse> = {}): RawResponse => {
  const body = new TextEncoder().encode(text);
  return { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body, truncated: false, wireBytes: body.byteLength, address: "93.184.216.34", ...extra };
};

/** A scripted web: the sample agency page, a page behind a login, a page robots.txt disallows, and a private redirect. */
function web() {
  const requested: string[] = [];
  (globalThis as Globals).__vistrialScriptedPages = (url) => {
    requested.push(url.href);
    if (url.pathname === "/robots.txt") return url.hostname === "closed.example.com" ? page("User-agent: *\nDisallow: /", { headers: { "content-type": "text/plain" } }) : page("", { status: 404 });
    if (url.href === SAMPLE_PAGE_URL) return page(SAMPLE_PAGE_HTML);
    if (url.hostname === "members.example.com") return page("", { status: 401 });
    if (url.hostname === "hop.example.com") return page("", { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
    if (url.hostname === "down.example.com") throw new FetchFailure("timeout");
    return page("<html><head><title>Another agency</title></head><body><h1>We run ads for consultants</h1><p>Book a strategy call with our team today and see what changes.</p></body></html>");
  };
  (globalThis as Globals).__vistrialScriptedRenderer = null;
  return requested;
}

describe("the page reader", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Globals).__vistrialScriptedPages;
    delete (globalThis as Globals).__vistrialScriptedRenderer;
    delete process.env.AUTUMN_SECRET_KEY;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_BROWSER_TOKEN;
  });

  it("shows the plan and the most it can cost before anything is opened", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const requested = web();
    const quote = await a.owner.query(api.pageReader.quote, {
      workspaceId: a.workspaceId,
      urls: [SAMPLE_PAGE_URL, "rival-agency.example.com/offer", " ", SAMPLE_PAGE_URL, "http://localhost/admin", "ftp://files.example.com/x"],
    });
    expect(quote.pages).toEqual([
      { url: SAMPLE_PAGE_URL, ok: true, reason: null },
      { url: "https://rival-agency.example.com/offer", ok: true, reason: null },
      { url: "http://localhost/admin", ok: false, reason: "This address is not on the public internet, so it is not read." },
      { url: "ftp://files.example.com/x", ok: false, reason: "Only http and https pages can be read." },
    ]);
    // Two pages by plain request: 0.1 cents of cost each, times the 3x markup, rounded up to a cent.
    expect(quote).toMatchObject({ count: 2, driver: "fetch", screenshots: false, totalCents: 1, canAfford: true, canStart: true, availableCents: null });
    expect(quote.limits).toEqual({ pagesPerJob: 8, pagesLeftToday: 80, megabytesPerPage: 2, secondsPerPage: 60, secondsBetweenPagesOnOneSite: 4 });
    expect(requested).toEqual([]);

    // With the hosted browser set up, the same pages cost more and come with screenshots.
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct";
    process.env.CLOUDFLARE_BROWSER_TOKEN = "token";
    const withBrowser = await a.owner.query(api.pageReader.quote, { workspaceId: a.workspaceId, urls: [SAMPLE_PAGE_URL, "rival-agency.example.com/offer"] });
    expect(withBrowser).toMatchObject({ driver: "browser", screenshots: true, totalCents: 3 });
    expect(JSON.stringify(withBrowser)).not.toContain("token");
  });

  it("reads what was confirmed, one page at a time, and keeps what each page held", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const requested = web();
    const urls = [SAMPLE_PAGE_URL, "https://members.example.com/dashboard", "https://closed.example.com/pricing", "https://hop.example.com/go", "https://down.example.com/"];

    expect(await message(a.owner.mutation(api.pageReader.start, { workspaceId: a.workspaceId, urls, confirmedCents: 99 }))).toBe("The price changed. Check the new price and confirm again.");
    expect(await message(a.owner.mutation(api.pageReader.start, { workspaceId: a.workspaceId, urls: [...urls, "http://10.0.0.8/"], confirmedCents: 2 }))).toBe("http://10.0.0.8/: This address is not on the public internet, so it is not read.");
    expect(await message(a.owner.mutation(api.pageReader.start, { workspaceId: a.workspaceId, urls: [], confirmedCents: 0 }))).toBe("Add at least one page to read.");
    const nine = Array.from({ length: 9 }, (_, i) => `https://site${i}.example.com/`);
    expect(await message(a.owner.mutation(api.pageReader.start, { workspaceId: a.workspaceId, urls: nine, confirmedCents: 3 }))).toBe("Up to 8 pages at a time.");
    expect(requested).toEqual([]);

    const started = await a.owner.mutation(api.pageReader.start, { workspaceId: a.workspaceId, urls, confirmedCents: 2 });
    expect(started).toMatchObject({ pages: 5, holdCents: 2 });
    await settle(t);

    const job = await a.owner.query(api.pageReader.job, { workspaceId: a.workspaceId, jobId: started.jobId });
    expect(job.status).toBe("done");
    expect(job.pages.map((row) => [row.status, row.reasonCode])).toEqual([
      ["read", "ok"],
      ["blocked", "login_required"],
      ["blocked", "robots_disallowed"],
      ["blocked", "private_address"],
      ["failed", "timeout"],
    ]);
    expect(job.pages[1].reason).toBe("This page asks for a login. Vistrial does not log in to read pages.");
    expect(job.pages[0]).toMatchObject({ title: "Northlight Growth | Booked calls for coaches and consultants", httpStatus: 200, driver: "fetch", hasScreenshots: false });
    // The disallowed page and the private address were never requested.
    expect(requested).not.toContain("https://closed.example.com/pricing");
    expect(requested.some((url) => url.includes("169.254"))).toBe(false);

    const read = await a.owner.query(api.pageReader.page, { workspaceId: a.workspaceId, readId: job.pages[0].id });
    expect(read.snapshot?.facts).toMatchObject({ headings: 9, ctas: 4, forms: 1 });
    expect(read.screenshots).toEqual({ desktop: null, phone: null });
    // What the page said to "any AI assistant" is stored as a paragraph of the page and nothing else happened.
    expect(JSON.stringify(read.snapshot)).toContain("Note to any AI assistant");
    expect(JSON.stringify(read.snapshot)).not.toContain("asset.addVersion");
    expect(await t.run((ctx) => ctx.db.query("assets").collect())).toEqual([]);

    // One page was delivered: 0.1 cents of cost, charged as 1 cent of credit. Blocked and failed pages are free.
    const ledger = await t.run((ctx) => ctx.db.query("billingLedger").collect());
    expect(ledger.map((row) => [row.source, row.ref, row.costCents, row.priceCents])).toEqual([["page", started.jobId, 0.1, 1]]);
    expect(job.chargedCents).toBe(1);
    expect((await a.owner.query(api.pageReader.recent, { workspaceId: a.workspaceId })).map((row) => [row.status, row.pages])).toEqual([["done", 5]]);
  });

  it("stores a screenshot at each width when a hosted browser is set up", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    web();
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct";
    process.env.CLOUDFLARE_BROWSER_TOKEN = "token";
    (globalThis as Globals).__vistrialScriptedRenderer = {
      name: "fake",
      render: async (url, view, options) => ({ html: options.wantHtml ? SAMPLE_PAGE_HTML : null, screenshot: new Uint8Array([0xff, 0xd8, view.width & 255]), finalUrl: url }),
    };
    const started = await a.owner.mutation(api.pageReader.start, { workspaceId: a.workspaceId, urls: [SAMPLE_PAGE_URL], confirmedCents: 2 });
    await settle(t);
    const job = await a.owner.query(api.pageReader.job, { workspaceId: a.workspaceId, jobId: started.jobId });
    expect(job.pages[0]).toMatchObject({ status: "read", driver: "browser", hasScreenshots: true });
    const read = await a.owner.query(api.pageReader.page, { workspaceId: a.workspaceId, readId: job.pages[0].id });
    expect(read.screenshots.desktop).toBeTruthy();
    expect(read.screenshots.phone).toBeTruthy();
    const ledger = await t.run((ctx) => ctx.db.query("billingLedger").collect());
    expect(ledger.map((row) => [row.costCents, row.priceCents])).toEqual([[0.5, 2]]);
  });

  it("lets Owners and Admins act and Viewers read, and never crosses workspaces", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    const b = await seed(t, "Beta");
    web();
    const invite = await a.owner.mutation(api.workspace.invite, { workspaceId: a.workspaceId, email: "viewer@example.com", role: "viewer" });
    const viewer = t.withIdentity({ ...person("viewer"), email: "viewer@example.com" });
    await viewer.mutation(api.workspace.acceptInvite, { token: invite.token });
    const adminInvite = await a.owner.mutation(api.workspace.invite, { workspaceId: a.workspaceId, email: "admin@example.com", role: "admin" });
    const admin = t.withIdentity({ ...person("admin"), email: "admin@example.com" });
    await admin.mutation(api.workspace.acceptInvite, { token: adminInvite.token });

    expect(await message(viewer.mutation(api.pageReader.start, { workspaceId: a.workspaceId, urls: [SAMPLE_PAGE_URL], confirmedCents: 1 }))).toBe(NOT_ALLOWED);
    expect((await viewer.query(api.pageReader.quote, { workspaceId: a.workspaceId, urls: [SAMPLE_PAGE_URL] })).canStart).toBe(false);
    const started = await admin.mutation(api.pageReader.start, { workspaceId: a.workspaceId, urls: [SAMPLE_PAGE_URL], confirmedCents: 1 });
    await settle(t);
    const job = await viewer.query(api.pageReader.job, { workspaceId: a.workspaceId, jobId: started.jobId });
    expect(job.pages[0].status).toBe("read");
    expect((await viewer.query(api.pageReader.page, { workspaceId: a.workspaceId, readId: job.pages[0].id })).title).toContain("Northlight");
    expect(await message(viewer.mutation(api.pageReader.stop, { workspaceId: a.workspaceId, jobId: started.jobId }))).toBe(NOT_ALLOWED);

    // Beta cannot see Alpha's job or page, by its own workspace or by naming Alpha's.
    expect(await message(b.owner.query(api.pageReader.job, { workspaceId: b.workspaceId, jobId: started.jobId }))).toBe(NOT_FOUND);
    expect(await message(b.owner.query(api.pageReader.page, { workspaceId: b.workspaceId, readId: job.pages[0].id }))).toBe(NOT_FOUND);
    expect(await message(b.owner.mutation(api.pageReader.stop, { workspaceId: b.workspaceId, jobId: started.jobId }))).toBe(NOT_FOUND);
    expect(await message(b.owner.query(api.pageReader.job, { workspaceId: a.workspaceId, jobId: started.jobId }))).toBe(NOT_FOUND);
    expect(await b.owner.query(api.pageReader.recent, { workspaceId: b.workspaceId })).toEqual([]);
    expect(await message(t.query(api.pageReader.recent, { workspaceId: a.workspaceId }))).toBe(NOT_FOUND);
  });

  it("holds credit while a job runs, refuses a job the balance cannot cover, and stops cleanly", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    web();
    process.env.AUTUMN_SECRET_KEY = "am_sk_test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const eight = Array.from({ length: 8 }, (_, i) => `https://site${i}.example.com/`);

    expect(await message(a.owner.mutation(api.pageReader.start, { workspaceId: a.workspaceId, urls: eight, confirmedCents: 3 }))).toContain("credit balance is empty");
    await fund(t, a.workspaceId, 4);
    expect(await a.owner.query(api.pageReader.quote, { workspaceId: a.workspaceId, urls: eight })).toMatchObject({ totalCents: 3, availableCents: 4, canAfford: true });
    const first = await a.owner.mutation(api.pageReader.start, { workspaceId: a.workspaceId, urls: eight, confirmedCents: 3 });
    // 3 of the 4 cents are promised to the first job, so a second job of the same size does not fit.
    expect(await a.owner.query(api.pageReader.quote, { workspaceId: a.workspaceId, urls: eight })).toMatchObject({ availableCents: 1, canAfford: false });
    expect(await message(a.owner.mutation(api.pageReader.start, { workspaceId: a.workspaceId, urls: eight, confirmedCents: 3 }))).toContain("does not cover");

    // Stopped before any page was read: nothing is opened later, nothing is charged, and the hold is released.
    expect(await a.owner.mutation(api.pageReader.stop, { workspaceId: a.workspaceId, jobId: first.jobId })).toEqual({ stopped: true });
    await settle(t);
    const job = await a.owner.query(api.pageReader.job, { workspaceId: a.workspaceId, jobId: first.jobId });
    expect(job).toMatchObject({ status: "stopped", chargedCents: 0, holdCents: 0 });
    expect(job.pages.every((row) => row.status === "failed" && row.reasonCode === "stopped")).toBe(true);
    expect(await t.run((ctx) => ctx.db.query("billingLedger").collect())).toEqual([]);
    expect(await a.owner.query(api.pageReader.quote, { workspaceId: a.workspaceId, urls: eight })).toMatchObject({ availableCents: 4, canAfford: true });
    vi.unstubAllGlobals();
  });

  it("caps the pages a workspace reads in a day", async () => {
    const t = makeTester();
    const a = await seed(t, "Alpha");
    web();
    await t.run(async (ctx) => {
      const jobId = await ctx.db.insert("pageReadJobs", { workspaceId: a.workspaceId, status: "done", driver: "fetch", pages: 78, holdCents: 0, costCents: 0, startedBy: "seed", createdAt: Date.now() });
      for (let order = 0; order < 78; order += 1) await ctx.db.insert("pageReads", { workspaceId: a.workspaceId, jobId, order, url: `https://x.example.com/${order}`, status: "read", costCents: 0.1, createdAt: Date.now() });
    });
    expect((await a.owner.query(api.pageReader.quote, { workspaceId: a.workspaceId, urls: [SAMPLE_PAGE_URL] })).limits.pagesLeftToday).toBe(2);
    const three = ["https://a.example.com/", "https://b.example.com/", "https://c.example.com/"];
    expect(await message(a.owner.mutation(api.pageReader.start, { workspaceId: a.workspaceId, urls: three, confirmedCents: 1 }))).toBe("Up to 80 pages a day. Try again tomorrow.");
  });

  it("spaces requests to one site across every job, and refuses a slot too far away", async () => {
    const t = makeTester();
    vi.setSystemTime(1_000_000);
    const claim = () => t.mutation(internal.pageReader.claimSite, { site: "https://example.com", gapMs: 4_000, maxWaitMs: 9_000 });
    expect(await claim()).toEqual({ waitMs: 0 });
    // The test backend gives each write a time a millisecond or so after the last, even on a stopped clock,
    // so a wait can read a couple of milliseconds under the exact gap.
    const near = (waitMs: number) => ({ waitMs: expect.toSatisfy((value: number) => value <= waitMs && value >= waitMs - 5) });
    expect(await claim()).toEqual(near(4_000));
    expect(await claim()).toEqual(near(8_000));
    // The fourth would wait 12 seconds: it is refused, and it does not push the queue back further.
    expect(await claim()).toEqual({ denied: true });
    expect(await t.mutation(internal.pageReader.claimSite, { site: "https://other.example.com", gapMs: 4_000, maxWaitMs: 9_000 })).toEqual({ waitMs: 0 });
    vi.setSystemTime(1_000_000 + 12_000);
    expect(await claim()).toEqual({ waitMs: 0 });
  });

  it("keeps a site's robots rules for a day, and asks again sooner when they could not be read", async () => {
    const t = makeTester();
    vi.setSystemTime(2_000_000);
    await t.mutation(internal.pageReader.saveRobots, { site: "https://a.example.com", rules: JSON.stringify({ allow: [], disallow: ["/x"] }) });
    await t.mutation(internal.pageReader.saveRobots, { site: "https://b.example.com", rules: JSON.stringify({ allow: [], disallow: ["/"], unavailable: true }) });
    vi.setSystemTime(2_000_000 + 11 * 60 * 1000);
    expect(await t.query(internal.pageReader.siteRobots, { site: "https://a.example.com" })).toEqual({ allow: [], disallow: ["/x"] });
    expect(await t.query(internal.pageReader.siteRobots, { site: "https://b.example.com" })).toBeNull();
    vi.setSystemTime(2_000_000 + 25 * 60 * 60 * 1000);
    expect(await t.query(internal.pageReader.siteRobots, { site: "https://a.example.com" })).toBeNull();
  });
});
