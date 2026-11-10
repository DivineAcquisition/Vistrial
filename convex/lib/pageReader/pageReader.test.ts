/**
 * The page reader's rules, without a network: which addresses it may open, how it reads robots.txt, what it
 * takes from a page's HTML, and how one read goes from link to result.
 */
import { describe, expect, it } from "vitest";

import { extractPage, snapshotText } from "./extract";
import { ROBOTS_AGENT, USER_AGENT, isPublicAddress, parseTarget } from "./net";
import { FetchFailure, READ_LIMITS, readPage, type RawResponse, type ReadEnv, type Renderer } from "./read";
import { browserConfigured, cloudflareBody, cloudflareRenderer, rendererFromEnv } from "./renderers";
import { DISALLOW_ALL, parseRobots, robotsAllows, rulesFromResponse, type RobotsRules } from "./robots";
import { SAMPLE_PAGE_HTML, SAMPLE_PAGE_URL } from "./sample";

describe("addresses", () => {
  it("accepts only addresses on the public internet", () => {
    for (const address of ["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111", "2a00:1450:4009:80b::200e", "::ffff:8.8.8.8", "64:ff9b::808:808"]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
    for (const address of [
      "127.0.0.1", "127.255.255.254", "0.0.0.0", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "192.0.0.1", "198.18.0.1", "224.0.0.1", "255.255.255.255",
      "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254", "::ffff:a9fe:a9fe", "64:ff9b::a9fe:a9fe", "2002:7f00:1::", "2001:db8::1", "fec0::1", "::7f00:1",
      "not-an-address", "", "1.2.3", "999.1.1.1",
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it("refuses links that are not plain public web pages", () => {
    const reason = (raw: string) => {
      const target = parseTarget(raw);
      return target.ok ? "ok" : target.reason;
    };
    expect(reason("https://example.com/pricing?x=1#top")).toBe("ok");
    expect(reason("http://example.com:80/")).toBe("ok");
    expect(reason("ftp://example.com/")).toBe("bad_scheme");
    expect(reason("file:///etc/passwd")).toBe("bad_scheme");
    expect(reason("javascript:alert(1)")).toBe("bad_scheme");
    expect(reason("nonsense")).toBe("bad_url");
    expect(reason("https://user:pass@example.com/")).toBe("has_credentials");
    expect(reason("https://example.com:8443/")).toBe("bad_port");
    expect(reason("http://example.com:22/")).toBe("bad_port");
    for (const raw of [
      "http://localhost/", "http://LOCALHOST./", "http://127.0.0.1/", "http://2130706433/", "http://0x7f.0.0.1/", "http://017700000001/", "http://127.1/", "http://[::1]/", "http://[::ffff:7f00:1]/",
      "http://169.254.169.254/latest/meta-data/", "http://10.1.2.3/", "http://192.168.0.10/", "http://intranet/", "http://db.internal/", "http://printer.local/", "http://app.localhost/", "http://0.0.0.0/",
    ]) {
      expect(reason(raw), raw).toBe("private_address");
    }
    const kept = parseTarget("https://example.com/a#section");
    expect(kept.ok && kept.url.href).toBe("https://example.com/a");
  });

  it("names itself honestly", () => {
    expect(USER_AGENT).toMatch(/^VistrialBot\/\d/);
    expect(USER_AGENT).toContain("https://vistrial.io/bot");
    expect(USER_AGENT).not.toMatch(/Mozilla|Chrome|Safari/);
  });
});

describe("robots.txt", () => {
  const text = [
    "# comment",
    "User-agent: *",
    "Disallow: /private/",
    "Disallow: /*.pdf$",
    "Allow: /private/press/",
    "Crawl-delay: 2",
    "",
    "User-agent: VistrialBot",
    "Disallow: /no-vistrial/",
    "",
    "User-agent: otherbot",
    "User-agent: thirdbot",
    "Disallow: /",
  ].join("\n");

  it("uses the group that names us over the star group", () => {
    const ours = parseRobots(text, ROBOTS_AGENT);
    expect(ours).toEqual({ allow: [], disallow: ["/no-vistrial/"] });
    expect(robotsAllows(ours, "/private/x")).toBe(true);
    expect(robotsAllows(ours, "/no-vistrial/page")).toBe(false);
  });

  it("falls back to the star group, with longest match and Allow winning a tie", () => {
    const star = parseRobots(text, "somebot");
    expect(star.crawlDelay).toBe(2);
    expect(robotsAllows(star, "/")).toBe(true);
    expect(robotsAllows(star, "/private/x")).toBe(false);
    expect(robotsAllows(star, "/private/press/release")).toBe(true);
    expect(robotsAllows(star, "/files/guide.pdf")).toBe(false);
    expect(robotsAllows(star, "/files/guide.pdf?download=1")).toBe(true);
    expect(robotsAllows({ allow: ["/a"], disallow: ["/a"] }, "/a")).toBe(true);
    expect(robotsAllows({ allow: [], disallow: ["/"] }, "/robots.txt")).toBe(true);
  });

  it("reads a missing file as open and a broken site as closed", () => {
    expect(robotsAllows(rulesFromResponse(404, "", ROBOTS_AGENT), "/x")).toBe(true);
    expect(robotsAllows(rulesFromResponse(503, "", ROBOTS_AGENT), "/x")).toBe(false);
    expect(rulesFromResponse(500, "", ROBOTS_AGENT).unavailable).toBe(true);
    expect(parseRobots("User-agent:\nDisallow: /", ROBOTS_AGENT)).toEqual({ allow: [], disallow: [] });
  });
});

describe("reading a page's HTML", () => {
  const page = extractPage(SAMPLE_PAGE_HTML, SAMPLE_PAGE_URL);
  const text = snapshotText(page);

  it("keeps the title, headings in order and the basic facts", () => {
    expect(page.title).toBe("Northlight Growth | Booked calls for coaches and consultants");
    expect(page.description).toContain("books sales calls");
    expect(page.lang).toBe("en");
    expect(page.canonical).toBe(SAMPLE_PAGE_URL);
    const headings = page.blocks.filter((row) => row.kind === "heading").map((row) => (row.kind === "heading" ? `${row.level} ${row.text}` : ""));
    expect(headings).toEqual([
      "1 Fill your calendar with sales calls from people who can afford you",
      "2 What clients got",
      "2 Sound familiar?",
      "2 What changes",
      "2 The Booked Calendar Build",
      "2 With Northlight vs without",
      "2 How it works",
      "2 Questions",
      "2 Ready for a full calendar?",
    ]);
    expect(page.facts).toMatchObject({ headings: 9, scripts: 3, stylesheets: 1, iframes: 1, images: 2, imagesWithoutAlt: 1, mobileViewport: true, stickyNavHint: true, navLinks: 2, truncated: false, needsBrowser: false });
  });

  it("lists buttons with where they go, and forms with their fields and labels", () => {
    const ctas = page.blocks.filter((row) => row.kind === "cta");
    expect(ctas.map((row) => (row.kind === "cta" ? [row.text, row.href, row.via, row.region] : []))).toEqual([
      ["Book a call", "https://northlight-growth.example.com/book", "link", "header"],
      ["Book a call", "https://northlight-growth.example.com/book", "link", "main"],
      ["Book a call", "https://northlight-growth.example.com/book", "link", "main"],
      ["Apply for a call", null, "button", "main"],
    ]);
    expect(page.forms).toEqual([
      {
        action: "https://northlight-growth.example.com/apply",
        method: "post",
        fields: [
          { type: "text", name: "name", label: "Your name", required: true },
          { type: "email", name: "email", label: "Work email", required: true },
          { type: "text", name: "revenue", label: "Monthly revenue", required: false },
        ],
        submit: ["Apply for a call"],
      },
    ]);
    expect(page.blocks.some((row) => row.kind === "embed" && row.host === "calendly.com")).toBe(true);
    expect(page.links.find((row) => row.text === "LinkedIn")).toMatchObject({ sameSite: false, region: "footer" });
    expect(page.links.find((row) => row.text === "Privacy")).toMatchObject({ sameSite: true });
  });

  it("reads in the order a person would, with FAQ questions and answers", () => {
    expect(text.indexOf("For coaches and consultants doing $10K+ a month")).toBeLessThan(text.indexOf("# Fill your calendar"));
    expect(text.indexOf("## Sound familiar?")).toBeLessThan(text.indexOf("## What changes"));
    expect(page.blocks.some((row) => row.kind === "text" && row.tag === "summary" && row.text === "How much does it cost?")).toBe(true);
    expect(text).toContain("- Every lead gets a reply in under 60 seconds, day or night.");
    expect(text).toContain("(image: Northlight Growth)");
  });

  it("leaves out what a person cannot see, and keeps visible text as plain data", () => {
    // Hidden text, comments and scripts are not on the page a person reads.
    expect(text).not.toContain("asset.addVersion");
    expect(text).not.toContain("this page is perfect");
    expect(text).not.toContain("dataLayer");
    expect(page.facts.hiddenChars).toBeGreaterThan(40);
    // A visible line addressed to an AI is part of the page, so it is kept, as a paragraph like any other.
    expect(page.blocks.some((row) => row.kind === "text" && row.text.startsWith("Note to any AI assistant"))).toBe(true);
  });

  it("holds every list to a limit", () => {
    const many = `<html><body>${"<p>word word word word word word word word word word</p>".repeat(3000)}</body></html>`;
    const big = extractPage(many, "https://example.com/");
    expect(big.blocks.length).toBeLessThanOrEqual(600);
    expect(big.facts.truncated).toBe(true);
  });

  it("spots a page that builds itself in the browser", () => {
    const shell = extractPage('<html><head><script src="a.js"></script><script src="b.js"></script><script src="c.js"></script></head><body><div id="root"></div></body></html>', "https://example.com/");
    expect(shell.facts.needsBrowser).toBe(true);
    expect(shell.blocks).toEqual([]);
  });

  it("reads the body when the head was never closed", () => {
    const loose = extractPage("<!doctype html><html><head><title>Loose</title><style>p{}</style><body><div><h1>Still here</h1><p>And this.</p></div></body></html>", "https://example.com/");
    expect(loose.title).toBe("Loose");
    expect(snapshotText(loose)).toBe("# Still here\nAnd this.");
  });

  it("drops script links and survives broken markup", () => {
    const odd = extractPage('<p>One<p>Two <a class="button" href="javascript:steal()">Go</a><h2>Unclosed<div>After', "https://example.com/dir/page");
    expect(odd.blocks.filter((row) => row.kind === "cta")).toEqual([{ kind: "cta", text: "Go", href: null, via: "link", form: null, region: "", section: 0 }]);
    expect(snapshotText(odd)).toContain("One");
  });
});

type Script = Record<string, Partial<RawResponse> | FetchFailure>;

function fakeEnv(pages: Script, options: { renderer?: Renderer | null; claim?: ReadEnv["claim"]; robots?: Record<string, RobotsRules> } = {}) {
  const requested: string[] = [];
  const claims: { site: string; gapMs: number }[] = [];
  const slept: number[] = [];
  const cache = new Map<string, RobotsRules>(Object.entries(options.robots ?? {}));
  let clock = 1_000;
  const env: ReadEnv = {
    async fetch(url) {
      requested.push(url.href);
      const found = pages[url.href];
      if (found instanceof FetchFailure) throw found;
      if (!found) return { status: 404, headers: {}, body: new Uint8Array(), truncated: false, wireBytes: 0, address: "93.184.216.34" };
      const body = found.body ?? new Uint8Array();
      return { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, truncated: false, wireBytes: body.byteLength, address: "93.184.216.34", ...found, body };
    },
    robots: async (site) => cache.get(site) ?? null,
    saveRobots: async (site, rules) => void cache.set(site, rules),
    claim:
      options.claim ??
      (async (site, gapMs) => {
        claims.push({ site, gapMs });
        return { waitMs: claims.filter((row) => row.site === site).length > 1 ? gapMs : 0 };
      }),
    sleep: async (ms) => void slept.push(ms),
    now: () => (clock += 5),
    renderer: options.renderer ?? null,
  };
  return { env, requested, claims, slept, cache };
}

const html = (text: string) => ({ body: new TextEncoder().encode(text) });
const ROBOTS = "https://northlight-growth.example.com/robots.txt";

describe("reading one page", () => {
  it("reads a public page: robots first, then the page, with what was found", async () => {
    const { env, requested, claims } = fakeEnv({ [SAMPLE_PAGE_URL]: html(SAMPLE_PAGE_HTML) });
    const result = await readPage(SAMPLE_PAGE_URL, env);
    expect(requested).toEqual([ROBOTS, SAMPLE_PAGE_URL]);
    expect(result).toMatchObject({ state: "read", reasonCode: "ok", driver: "fetch", httpStatus: 200, finalUrl: SAMPLE_PAGE_URL, redirects: 0, screenshots: {} });
    expect(result.htmlBytes).toBe(new TextEncoder().encode(SAMPLE_PAGE_HTML).byteLength);
    expect(result.snapshot?.facts.ctas).toBe(4);
    expect(claims).toEqual([{ site: "https://northlight-growth.example.com", gapMs: READ_LIMITS.siteGapMs }]);
  });

  it("never opens a private address, as typed or after a redirect", async () => {
    for (const raw of ["http://169.254.169.254/latest/meta-data/", "http://localhost:80/", "file:///etc/passwd", "http://[::1]/"]) {
      const { env, requested } = fakeEnv({});
      const result = await readPage(raw, env);
      expect(result.state, raw).toBe("blocked");
      expect(requested, raw).toEqual([]);
    }
    const { env, requested } = fakeEnv({ "https://example.com/go": { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/iam/" } } });
    const result = await readPage("https://example.com/go", env);
    expect(result).toMatchObject({ state: "blocked", reasonCode: "private_address", snapshot: null });
    expect(requested).toEqual(["https://example.com/robots.txt", "https://example.com/go"]);

    const rebinding = fakeEnv({ "https://rebind.example.com/": new FetchFailure("private_address") }, { robots: { "https://rebind.example.com": { allow: [], disallow: [] } } });
    expect(await readPage("https://rebind.example.com/", rebinding.env)).toMatchObject({ state: "blocked", reasonCode: "private_address" });
  });

  it("checks robots and the rate limit again for every site a redirect crosses", async () => {
    const { env, requested, claims } = fakeEnv({
      "https://short.example.com/x": { status: 301, headers: { location: "https://northlight-growth.example.com/" } },
      [SAMPLE_PAGE_URL]: html(SAMPLE_PAGE_HTML),
    });
    const result = await readPage("https://short.example.com/x", env);
    expect(result).toMatchObject({ state: "read", redirects: 1, finalUrl: SAMPLE_PAGE_URL });
    expect(requested).toEqual(["https://short.example.com/robots.txt", "https://short.example.com/x", ROBOTS, SAMPLE_PAGE_URL]);
    expect(claims.map((row) => row.site)).toEqual(["https://short.example.com", "https://northlight-growth.example.com"]);

    const blocked = fakeEnv({
      "https://short.example.com/x": { status: 301, headers: { location: "https://northlight-growth.example.com/members/area" } },
      [ROBOTS]: html("User-agent: *\nDisallow: /members/"),
    });
    expect(await readPage("https://short.example.com/x", blocked.env)).toMatchObject({ state: "blocked", reasonCode: "robots_disallowed" });
    expect(blocked.requested).not.toContain("https://northlight-growth.example.com/members/area");
  });

  it("obeys robots.txt, and stays out when it cannot be read", async () => {
    const disallowed = fakeEnv({ [ROBOTS]: html("User-agent: *\nDisallow: /"), [SAMPLE_PAGE_URL]: html(SAMPLE_PAGE_HTML) });
    expect(await readPage(SAMPLE_PAGE_URL, disallowed.env)).toMatchObject({ state: "blocked", reasonCode: "robots_disallowed", snapshot: null });
    expect(disallowed.requested).toEqual([ROBOTS]);

    const broken = fakeEnv({ [ROBOTS]: { status: 503 }, [SAMPLE_PAGE_URL]: html(SAMPLE_PAGE_HTML) });
    expect(await readPage(SAMPLE_PAGE_URL, broken.env)).toMatchObject({ state: "blocked", reasonCode: "robots_unavailable" });
    expect(broken.cache.get("https://northlight-growth.example.com")).toEqual(DISALLOW_ALL);

    const cached = fakeEnv({ [SAMPLE_PAGE_URL]: html(SAMPLE_PAGE_HTML) }, { robots: { "https://northlight-growth.example.com": { allow: [], disallow: [] } } });
    await readPage(SAMPLE_PAGE_URL, cached.env);
    expect(cached.requested).toEqual([SAMPLE_PAGE_URL]);
  });

  it("waits for the site's turn, honours Crawl-delay, and leaves the page when the wait is too long", async () => {
    const slow = fakeEnv({ [ROBOTS]: html("User-agent: *\nCrawl-delay: 10"), [SAMPLE_PAGE_URL]: html(SAMPLE_PAGE_HTML) });
    await readPage(SAMPLE_PAGE_URL, slow.env);
    await readPage(SAMPLE_PAGE_URL, slow.env);
    expect(slow.claims.map((row) => row.gapMs)).toEqual([10_000, 10_000]);
    expect(slow.slept).toEqual([10_000]);

    const tooSlow = fakeEnv({ [ROBOTS]: html("User-agent: *\nCrawl-delay: 120"), [SAMPLE_PAGE_URL]: html(SAMPLE_PAGE_HTML) });
    expect(await readPage(SAMPLE_PAGE_URL, tooSlow.env)).toMatchObject({ state: "blocked", reasonCode: "crawl_delay_too_long" });
    expect(tooSlow.requested).toEqual([ROBOTS]);

    const busy = fakeEnv({ [SAMPLE_PAGE_URL]: html(SAMPLE_PAGE_HTML) }, { claim: async () => ({ denied: true }) });
    expect(await readPage(SAMPLE_PAGE_URL, busy.env)).toMatchObject({ state: "failed", reasonCode: "rate_limited" });
    expect(busy.requested).toEqual([ROBOTS]);
  });

  it("reports a login, a block or a bot check as blocked, and makes one request only", async () => {
    const cases: [Partial<RawResponse>, string][] = [
      [{ status: 401 }, "login_required"],
      [{ status: 403, ...html("<title>Forbidden</title>") }, "blocked_by_site"],
      [{ status: 403, headers: { "content-type": "text/html", "cf-mitigated": "challenge" }, ...html("<title>Just a moment...</title>") }, "bot_challenge"],
      [{ status: 200, ...html("<html><head><title>Just a moment...</title></head><body><p>Checking your browser</p></body></html>") }, "bot_challenge"],
      [{ status: 429 }, "site_rate_limited"],
      [{ status: 200, ...html('<html><body><h1>Sign in</h1><form><input type="email" name="e"><input type="password" name="p"><button>Sign in</button></form></body></html>') }, "login_required"],
    ];
    for (const [response, reasonCode] of cases) {
      const { env, requested } = fakeEnv({ "https://example.com/page": response });
      const result = await readPage("https://example.com/page", env);
      expect(result, reasonCode).toMatchObject({ state: "blocked", reasonCode, snapshot: null });
      expect(requested.filter((url) => url.endsWith("/page")), reasonCode).toHaveLength(1);
    }
  });

  it("says plainly what else went wrong", async () => {
    const cases: [Partial<RawResponse> | FetchFailure, string, string][] = [
      [{ status: 404 }, "failed", "not_found"],
      [{ status: 500 }, "failed", "site_error"],
      [{ status: 200, headers: { "content-type": "application/pdf" } }, "failed", "not_html"],
      [new FetchFailure("timeout"), "failed", "timeout"],
      [new FetchFailure("dns_failed"), "failed", "dns_failed"],
      [{ status: 200, truncated: true, ...html(SAMPLE_PAGE_HTML) }, "partial", "too_large"],
      [{ status: 200, ...html('<html><head><script src="a.js"></script><script src="b.js"></script><script src="c.js"></script></head><body><div id="root"></div></body></html>') }, "partial", "needs_browser"],
    ];
    for (const [response, state, reasonCode] of cases) {
      const { env } = fakeEnv({ "https://example.com/page": response });
      expect(await readPage("https://example.com/page", env), reasonCode).toMatchObject({ state, reasonCode });
    }
    const loop = fakeEnv(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`https://example.com/${i}`, { status: 302, headers: { location: `/${i + 1}` } }])));
    expect(await readPage("https://example.com/0", loop.env)).toMatchObject({ state: "failed", reasonCode: "too_many_redirects", redirects: 6 });
  });

  it("uses a hosted browser when there is one: rendered content and a screenshot at each width", async () => {
    const calls: { url: string; width: number; userAgent: string }[] = [];
    const renderer: Renderer = {
      name: "fake",
      async render(url, view, options) {
        calls.push({ url, width: view.width, userAgent: options.userAgent });
        return { html: options.wantHtml ? SAMPLE_PAGE_HTML : null, screenshot: new Uint8Array([0xff, 0xd8, view.width & 255]), finalUrl: url };
      },
    };
    const shell = '<html><head><script src="a.js"></script><script src="b.js"></script><script src="c.js"></script></head><body><div id="root"></div></body></html>';
    const { env } = fakeEnv({ [SAMPLE_PAGE_URL]: html(shell) }, { renderer });
    const result = await readPage(SAMPLE_PAGE_URL, env);
    expect(result).toMatchObject({ state: "read", reasonCode: "ok", driver: "browser" });
    expect(result.snapshot?.facts.headings).toBe(9);
    expect(Object.keys(result.screenshots).sort()).toEqual(["desktop", "phone"]);
    expect(calls).toEqual([
      { url: SAMPLE_PAGE_URL, width: 1280, userAgent: USER_AGENT },
      { url: SAMPLE_PAGE_URL, width: 390, userAgent: USER_AGENT },
    ]);
  });

  it("does not ask the browser for a page the rules refused, and survives the browser failing", async () => {
    let rendered = 0;
    const renderer: Renderer = { name: "fake", render: async () => ((rendered += 1), Promise.reject(new Error("render_500"))) };
    const refused = fakeEnv({ [ROBOTS]: html("User-agent: *\nDisallow: /") }, { renderer });
    await readPage(SAMPLE_PAGE_URL, refused.env);
    expect(rendered).toBe(0);
    const failing = fakeEnv({ [SAMPLE_PAGE_URL]: html(SAMPLE_PAGE_HTML) }, { renderer });
    expect(await readPage(SAMPLE_PAGE_URL, failing.env)).toMatchObject({ state: "read", driver: "fetch", screenshots: {} });
    expect(rendered).toBe(2);

    // A script moved the browser somewhere private: what it drew is thrown away.
    const moved: Renderer = { name: "fake", render: async () => ({ html: "<h1>Internal admin</h1>", screenshot: new Uint8Array([1]), finalUrl: "http://10.0.0.5/admin" }) };
    const result = await readPage(SAMPLE_PAGE_URL, fakeEnv({ [SAMPLE_PAGE_URL]: html(SAMPLE_PAGE_HTML) }, { renderer: moved }).env);
    expect(result).toMatchObject({ driver: "fetch", screenshots: {} });
    expect(result.snapshot?.title).toContain("Northlight");
  });
});

describe("the hosted browser", () => {
  it("is off until both settings are present", () => {
    expect(browserConfigured(() => undefined)).toBe(false);
    expect(browserConfigured((name) => (name === "CLOUDFLARE_ACCOUNT_ID" ? "acct" : undefined))).toBe(false);
    expect(rendererFromEnv(() => undefined)).toBeNull();
    expect(rendererFromEnv(() => "set")?.name).toBe("cloudflare");
  });

  it("asks for a full-page screenshot at the width given, as our own user agent, with no stealth options", () => {
    const body = cloudflareBody("https://example.com/", { width: 390, height: 844, mobile: true }, { timeoutMs: 45_000, userAgent: USER_AGENT, wantHtml: false });
    expect(body).toMatchObject({ url: "https://example.com/", formats: ["screenshot"], userAgent: USER_AGENT, viewport: { width: 390, isMobile: true }, screenshotOptions: { fullPage: true } });
    expect(Object.keys(body)).not.toEqual(expect.arrayContaining(["cookies", "authenticate", "proxy", "stealth"]));
    expect(body.rejectRequestPattern.length).toBeGreaterThan(0);
  });

  it("sends the token only to Cloudflare, falls back to the renamed path, and keeps no error text", async () => {
    const seen: { url: string; auth: string }[] = [];
    const setting = (name: string) => ({ CLOUDFLARE_ACCOUNT_ID: "acct1", CLOUDFLARE_BROWSER_TOKEN: "secret-token" })[name];
    const renderer = cloudflareRenderer(setting, async (url, init) => {
      seen.push({ url, auth: init.headers.authorization });
      if (url.includes("/browser-rendering/")) return { status: 404, ok: false, json: async () => ({}) };
      return { status: 200, ok: true, json: async () => ({ success: true, result: { content: "<h1>Hi</h1>", screenshot: btoa("img") }, meta: { finalUrl: "https://example.com/" } }) };
    });
    const drawn = await renderer.render("https://example.com/", { width: 1280, height: 800, mobile: false }, { timeoutMs: 1000, userAgent: USER_AGENT, wantHtml: true });
    expect(seen.map((row) => row.url)).toEqual([
      "https://api.cloudflare.com/client/v4/accounts/acct1/browser-rendering/snapshot",
      "https://api.cloudflare.com/client/v4/accounts/acct1/browser-run/snapshot",
    ]);
    expect(seen.every((row) => row.auth === "Bearer secret-token")).toBe(true);
    expect(drawn.html).toBe("<h1>Hi</h1>");
    expect(new TextDecoder().decode(drawn.screenshot!)).toBe("img");

    const failing = cloudflareRenderer(setting, async () => ({ status: 403, ok: false, json: async () => ({ errors: [{ message: "token secret-token rejected" }] }) }));
    const error = await failing.render("https://example.com/", { width: 1280, height: 800, mobile: false }, { timeoutMs: 1000, userAgent: USER_AGENT, wantHtml: true }).catch((caught: Error) => caught);
    expect((error as Error).message).toBe("render_403");
  });
});
