/**
 * Reading one public page, start to finish, with everything it touches passed in: the network, the robots
 * cache, the per-site rate limit and the optional hosted browser. So the rules live in one place and tests
 * run them against fixtures.
 *
 * The rules, in the order they apply to every hop:
 *   1. The link must be a public http(s) address (see net.ts). A redirect is a new link and is checked again.
 *   2. The site's robots.txt must allow it.
 *   3. The site's rate limit must have room; otherwise the page is left for later, not forced.
 *   4. The request says who we are. A page that answers with a login, a block or a challenge is reported as
 *      blocked. Vistrial does not log in, solve a challenge, retry around a block or change its identity.
 */
import { extractPage, type PageSnapshot } from "./extract";
import { ROBOTS_AGENT, USER_AGENT, parseTarget, siteKey } from "./net";
import { DISALLOW_ALL, MAX_ROBOTS_BYTES, robotsAllows, rulesFromResponse, type RobotsRules } from "./robots";

export const READ_LIMITS = {
  /** Pages in one job. */
  pagesPerJob: 8,
  /** Pages a workspace may read in a day. */
  pagesPerDay: 80,
  /** HTML bytes kept from one page, after decompression. */
  bytesPerPage: 2_000_000,
  /** Seconds for one request. */
  requestMs: 20_000,
  /** Seconds for the whole page, redirects and waiting included (not the browser render). */
  pageMs: 60_000,
  redirects: 5,
  /** The least time between two requests to one site, across every workspace. */
  siteGapMs: 4_000,
  /** A site may ask for a longer gap in robots.txt. Up to this, we wait; beyond it, we leave the site alone. */
  maxCrawlDelayMs: 20_000,
  /** The longest we wait for a site's turn before leaving the page for later. */
  maxWaitMs: 25_000,
  robotsTtlMs: 24 * 60 * 60 * 1000,
  renderMs: 45_000,
} as const;

export const VIEWPORTS = {
  desktop: { width: 1280, height: 800, mobile: false },
  phone: { width: 390, height: 844, mobile: true },
} as const;
export type ViewportName = keyof typeof VIEWPORTS;

export class FetchFailure extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export type RawResponse = {
  status: number;
  /** Lower-case names. */
  headers: Record<string, string>;
  body: Uint8Array;
  /** The body was cut at the byte limit. */
  truncated: boolean;
  /** Bytes as they came over the wire (compressed). */
  wireBytes: number;
  address: string;
};

export type Rendered = { html: string | null; screenshot: Uint8Array | null; finalUrl: string | null };

/** A hosted browser. It opens a public page that has already passed the rules above and returns what it drew. */
export type Renderer = {
  name: string;
  render(url: string, view: { width: number; height: number; mobile: boolean }, options: { timeoutMs: number; userAgent: string; wantHtml: boolean }): Promise<Rendered>;
};

export type ReadEnv = {
  /** One request, no redirects followed. Throws FetchFailure. */
  fetch(url: URL, options: { timeoutMs: number; maxBytes: number; accept?: string }): Promise<RawResponse>;
  /** Cached robots rules for a site, or null when there are none fresh. */
  robots(site: string): Promise<RobotsRules | null>;
  saveRobots(site: string, rules: RobotsRules): Promise<void>;
  /** Asks for the site's next slot. `waitMs` is how long until it; `denied` when that is longer than `maxWaitMs`. */
  claim(site: string, gapMs: number, maxWaitMs: number): Promise<{ waitMs: number } | { denied: true }>;
  sleep(ms: number): Promise<void>;
  now(): number;
  renderer: Renderer | null;
};

export type PageState = "read" | "partial" | "blocked" | "failed";

export type PageResult = {
  state: PageState;
  reasonCode: string;
  finalUrl: string | null;
  httpStatus: number | null;
  /** "browser" when a hosted browser rendered the page; "fetch" when only the plain request ran. */
  driver: "fetch" | "browser";
  snapshot: PageSnapshot | null;
  htmlBytes: number;
  wireBytes: number;
  redirects: number;
  durationMs: number;
  screenshots: Partial<Record<ViewportName, Uint8Array>>;
};

/** What each outcome means, in words a person reads. Codes never carry page text. */
export const REASON_WORDS: Record<string, string> = {
  ok: "Read.",
  bad_url: "This is not a web address.",
  bad_scheme: "Only http and https pages can be read.",
  has_credentials: "A link with a user name or password in it is not read.",
  bad_port: "Only pages on the standard web ports are read.",
  private_address: "This address is not on the public internet, so it is not read.",
  robots_disallowed: "This site's robots.txt asks crawlers not to open this page, so Vistrial did not.",
  robots_unavailable: "This site's robots.txt could not be read, so Vistrial stayed out for now.",
  rate_limited: "This site was read very recently. Vistrial waits between pages on one site; try again in a minute.",
  crawl_delay_too_long: "This site asks crawlers to wait a long time between pages, so Vistrial left it alone.",
  too_many_redirects: "The page kept redirecting.",
  login_required: "This page asks for a login. Vistrial does not log in to read pages.",
  blocked_by_site: "The site refused the request. Vistrial does not work around a block.",
  bot_challenge: "The site showed a bot check. Vistrial does not solve or bypass them.",
  site_rate_limited: "The site said it is getting too many requests. Vistrial stopped.",
  not_found: "There is no page at this address.",
  site_error: "The site returned an error.",
  not_html: "This address is not a web page (it is a file or some other content).",
  timeout: "The page took too long to answer.",
  dns_failed: "This address could not be found.",
  tls_failed: "The site's secure connection failed.",
  connect_failed: "The site could not be reached.",
  bad_encoding: "The page could not be decoded.",
  too_large: "The page is larger than Vistrial reads in one go, so the end is missing.",
  needs_browser: "This page builds itself in the browser, so a plain request sees very little of it. A hosted browser is needed to read it fully.",
  empty: "The page had nothing readable on it.",
  stopped: "Stopped before this page was read.",
};

const CHALLENGE_TITLE = /^(just a moment|attention required|access denied|verify(ing)? (you are|that you are) (a )?human|are you a robot|security check|please verify|pardon our interruption)/i;
const HTML_TYPE = /(text\/html|application\/xhtml\+xml)/i;

function decode(body: Uint8Array, contentType: string): string {
  const declared = contentType.match(/charset=["']?([\w-]+)/i)?.[1];
  // A <meta charset> in the first bytes, when the header does not say.
  const sniffed = declared ?? new TextDecoder("latin1").decode(body.subarray(0, 2048)).match(/<meta[^>]+charset=["']?\s*([\w-]+)/i)?.[1];
  try {
    return new TextDecoder(sniffed ?? "utf-8").decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

function blank(reasonCode: string, state: PageState, started: number, env: ReadEnv, extra: Partial<PageResult> = {}): PageResult {
  return { state, reasonCode, finalUrl: null, httpStatus: null, driver: "fetch", snapshot: null, htmlBytes: 0, wireBytes: 0, redirects: 0, durationMs: env.now() - started, screenshots: {}, ...extra };
}

/** The site's robots rules: from the cache, or fetched once and cached. Never throws. */
export async function robotsFor(url: URL, env: ReadEnv): Promise<RobotsRules> {
  const site = siteKey(url);
  const cached = await env.robots(site);
  if (cached) return cached;
  let rules: RobotsRules = DISALLOW_ALL;
  try {
    let at = new URL("/robots.txt", url);
    for (let hop = 0; hop <= 3; hop += 1) {
      const response = await env.fetch(at, { timeoutMs: 8_000, maxBytes: MAX_ROBOTS_BYTES, accept: "text/plain,*/*;q=0.1" });
      const location = response.headers.location;
      if (response.status >= 300 && response.status < 400 && location) {
        const next = parseTarget(new URL(location, at).href);
        if (!next.ok) break;
        at = next.url;
        continue;
      }
      rules = rulesFromResponse(response.status, new TextDecoder("utf-8").decode(response.body), ROBOTS_AGENT);
      break;
    }
  } catch {
    // No answer: stay out until the site can say (the rules stay "disallow all", cached only briefly).
  }
  await env.saveRobots(site, rules);
  return rules;
}

/**
 * Opens one public page and returns what is on it. Never throws: every way it can go wrong is a state and a
 * reason code.
 */
export async function readPage(rawUrl: string, env: ReadEnv): Promise<PageResult> {
  const started = env.now();
  const first = parseTarget(rawUrl);
  if (!first.ok) return blank(first.reason, "blocked", started, env);

  let url = first.url;
  let redirects = 0;
  let response: RawResponse | null = null;
  for (;;) {
    if (env.now() - started > READ_LIMITS.pageMs) return blank("timeout", "failed", started, env, { redirects });
    const rules = await robotsFor(url, env);
    if (!robotsAllows(rules, `${url.pathname}${url.search}`)) {
      return blank(rules.unavailable ? "robots_unavailable" : "robots_disallowed", "blocked", started, env, { redirects, finalUrl: url.href });
    }
    const delayMs = (rules.crawlDelay ?? 0) * 1000;
    if (delayMs > READ_LIMITS.maxCrawlDelayMs) return blank("crawl_delay_too_long", "blocked", started, env, { redirects, finalUrl: url.href });
    const slot = await env.claim(siteKey(url), Math.max(READ_LIMITS.siteGapMs, delayMs), READ_LIMITS.maxWaitMs);
    if ("denied" in slot) return blank("rate_limited", "failed", started, env, { redirects, finalUrl: url.href });
    if (slot.waitMs > 0) await env.sleep(slot.waitMs);

    try {
      response = await env.fetch(url, { timeoutMs: READ_LIMITS.requestMs, maxBytes: READ_LIMITS.bytesPerPage });
    } catch (error) {
      const code = error instanceof FetchFailure ? error.code : "connect_failed";
      return blank(code, code === "private_address" ? "blocked" : "failed", started, env, { redirects, finalUrl: url.href });
    }
    const location = response.headers.location;
    if (response.status >= 300 && response.status < 400 && location) {
      redirects += 1;
      if (redirects > READ_LIMITS.redirects) return blank("too_many_redirects", "failed", started, env, { redirects, finalUrl: url.href });
      let target: string;
      try {
        target = new URL(location, url).href;
      } catch {
        return blank("bad_url", "failed", started, env, { redirects, finalUrl: url.href });
      }
      // A redirect is a new link: the same address, robots and rate-limit rules apply to where it points.
      const next = parseTarget(target);
      if (!next.ok) return blank(next.reason, "blocked", started, env, { redirects, finalUrl: url.href });
      url = next.url;
      continue;
    }
    break;
  }

  const base = { finalUrl: url.href, httpStatus: response.status, redirects, htmlBytes: response.body.byteLength, wireBytes: response.wireBytes };
  const status = response.status;
  const type = response.headers["content-type"] ?? "";
  const mitigated = (response.headers["cf-mitigated"] ?? "").toLowerCase().includes("challenge");
  if (mitigated) return blank("bot_challenge", "blocked", started, env, base);
  if (status === 401 || status === 407) return blank("login_required", "blocked", started, env, base);
  if (status === 429) return blank("site_rate_limited", "blocked", started, env, base);
  if (status === 404 || status === 410) return blank("not_found", "failed", started, env, base);

  const html = HTML_TYPE.test(type) || (!type && status === 200) ? decode(response.body, type) : null;
  const snapshot = html ? extractPage(html, url.href) : null;
  if (snapshot && CHALLENGE_TITLE.test(snapshot.title) && snapshot.facts.words < 200) return blank("bot_challenge", "blocked", started, env, base);
  if (status === 403 || status === 451) return blank("blocked_by_site", "blocked", started, env, base);
  if (status >= 500) return blank("site_error", "failed", started, env, base);
  if (status >= 400) return blank("site_error", "failed", started, env, base);
  if (!snapshot) return blank("not_html", "failed", started, env, base);
  const passwordField = snapshot.forms.some((form) => form.fields.some((field) => field.type === "password"));
  if (passwordField && snapshot.facts.words < 150) return blank("login_required", "blocked", started, env, base);

  let best = snapshot;
  let driver: PageResult["driver"] = "fetch";
  const screenshots: PageResult["screenshots"] = {};
  if (env.renderer) {
    for (const name of ["desktop", "phone"] as const) {
      try {
        const drawn = await env.renderer.render(url.href, VIEWPORTS[name], { timeoutMs: READ_LIMITS.renderMs, userAgent: USER_AGENT, wantHtml: name === "desktop" });
        // The browser may have been moved on by a script. What it ended on must still be a public page.
        if (drawn.finalUrl && !parseTarget(drawn.finalUrl).ok) continue;
        if (drawn.screenshot?.byteLength) screenshots[name] = drawn.screenshot;
        if (drawn.html) {
          const rendered = extractPage(drawn.html.slice(0, READ_LIMITS.bytesPerPage), drawn.finalUrl ?? url.href);
          const challenged = CHALLENGE_TITLE.test(rendered.title) && rendered.facts.words < 200;
          if (!challenged && rendered.facts.words >= best.facts.words) {
            best = rendered;
            driver = "browser";
          }
        }
        if (drawn.screenshot?.byteLength) driver = "browser";
      } catch {
        // The plain read stands. A page without a screenshot says so in its driver.
      }
    }
  }

  const done = (state: PageState, reasonCode: string): PageResult => ({ state, reasonCode, ...base, driver, snapshot: best, durationMs: env.now() - started, screenshots });
  if (best.blocks.length === 0) return done("partial", best.facts.needsBrowser ? "needs_browser" : "empty");
  if (best.facts.needsBrowser && driver === "fetch") return done("partial", "needs_browser");
  if (response.truncated || best.facts.truncated) return done("partial", "too_large");
  return done("read", "ok");
}
