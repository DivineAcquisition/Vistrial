/**
 * The hosted browser behind the page reader. Convex cannot run Chromium, so a real browser, when there is
 * one, is a service called over HTTPS. Today that is Cloudflare Browser Run (formerly Browser Rendering):
 * its requests are always signed and flagged as bot traffic and cannot be made to look like a person, it has
 * no CAPTCHA solving and no rotating addresses, and one call returns the rendered HTML with a screenshot.
 *
 * With no key set there is no renderer, and the reader works from a plain request alone.
 */
import type { Rendered, Renderer } from "./read";

type Setting = (name: string) => string | undefined;
type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ status: number; ok: boolean; headers?: { get(name: string): string | null }; json(): Promise<unknown> }>;
type Wait = (ms: number) => Promise<void>;

/**
 * The hosted browser's own rate limit (on Cloudflare's free plan, one request every ten seconds). A page
 * needs two renders, desktop then phone, so the second is often told to wait. It is asked once more after
 * the wait the service names, never sooner and never more than once.
 */
const RATE_WAIT_MS = { fallback: 10_000, most: 20_000 } as const;

function rateWaitMs(header: string | null | undefined) {
  const seconds = Number(header);
  if (!header || !Number.isFinite(seconds) || seconds <= 0) return RATE_WAIT_MS.fallback;
  return Math.min(RATE_WAIT_MS.most, Math.ceil(seconds) * 1000);
}

/** The settings the owner adds to turn the hosted browser on. Neither is ever returned, logged or saved. */
export const BROWSER_SETTINGS = ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_BROWSER_TOKEN"] as const;

export function browserConfigured(setting: Setting = (name) => process.env[name] || undefined) {
  return BROWSER_SETTINGS.every((name) => Boolean(setting(name)));
}

/** Requests the hosted browser must never make while drawing a page: anything aimed at a private address. */
const PRIVATE_REQUESTS = [
  "/^https?:\\/\\/(localhost|[^\\/]*\\.(local|internal|localhost))(:|\\/|$)/",
  "/^https?:\\/\\/(127\\.|10\\.|0\\.|169\\.254\\.|192\\.168\\.|172\\.(1[6-9]|2\\d|3[01])\\.)/",
  "/^https?:\\/\\/\\[(::1|f[cd]|fe[89ab])/",
];

/** Cloudflare has two names for the same path while it renames the product. The first that answers is used. */
const PATHS = ["browser-rendering", "browser-run"] as const;

function bytes(base64: string): Uint8Array {
  const binary = atob(base64.replace(/^data:[^,]+,/, ""));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function cloudflareBody(url: string, view: { width: number; height: number; mobile: boolean }, options: { timeoutMs: number; userAgent: string; wantHtml: boolean }) {
  return {
    url,
    // Cloudflare refuses a request for fewer than two formats (400), so the HTML is always asked for and
    // dropped below when the caller only wants the picture.
    formats: ["content", "screenshot"],
    viewport: { width: view.width, height: view.height, deviceScaleFactor: 1, isMobile: view.mobile, hasTouch: view.mobile },
    userAgent: options.userAgent,
    gotoOptions: { waitUntil: "networkidle2", timeout: Math.min(30_000, options.timeoutMs) },
    screenshotOptions: { fullPage: true, type: "jpeg", quality: 70 },
    rejectResourceTypes: ["media"],
    rejectRequestPattern: PRIVATE_REQUESTS,
    bestAttempt: true,
  };
}

export function cloudflareRenderer(setting: Setting, fetcher: Fetch, wait: Wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))): Renderer {
  return {
    name: "cloudflare",
    async render(url, view, options): Promise<Rendered> {
      const account = setting("CLOUDFLARE_ACCOUNT_ID");
      const token = setting("CLOUDFLARE_BROWSER_TOKEN");
      if (!account || !token) throw new Error("not_configured");
      let waited = false;
      for (const path of PATHS) {
        const ask = () =>
          fetcher(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/${path}/snapshot`, {
            method: "POST",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify(cloudflareBody(url, view, options)),
            signal: AbortSignal.timeout(options.timeoutMs),
          });
        let response = await ask();
        if (response.status === 429 && !waited) {
          waited = true;
          await wait(rateWaitMs(response.headers?.get("retry-after")));
          response = await ask();
        }
        if (response.status === 404 && path !== PATHS[PATHS.length - 1]) continue;
        // Codes only. Cloudflare's error text is never kept: it could echo the request.
        if (!response.ok) throw new Error(`render_${response.status}`);
        const body = (await response.json()) as { success?: boolean; result?: { content?: unknown; screenshot?: unknown }; meta?: { finalUrl?: unknown } } | null;
        if (!body?.success || !body.result) throw new Error("render_failed");
        return {
          html: options.wantHtml && typeof body.result.content === "string" ? body.result.content : null,
          screenshot: typeof body.result.screenshot === "string" && body.result.screenshot ? bytes(body.result.screenshot) : null,
          finalUrl: typeof body.meta?.finalUrl === "string" ? body.meta.finalUrl : null,
        };
      }
      throw new Error("render_404");
    },
  };
}

/** The renderer this deployment has, or null when no key is set. */
export function rendererFromEnv(setting: Setting = (name) => process.env[name] || undefined, fetcher: Fetch = (url, init) => fetch(url, init)): Renderer | null {
  return browserConfigured(setting) ? cloudflareRenderer(setting, fetcher) : null;
}
