/**
 * Fetching a site's own stylesheet or logo file for a capture, under the same rules as reading a page:
 * a public address on every hop, robots.txt, the per-site gap, VistrialBot as the agent, no login, and a
 * size limit. Never throws: a file that cannot be fetched is simply not used.
 */
import { parseTarget, siteKey } from "../pageReader/net";
import { READ_LIMITS, robotsFor, type ReadEnv } from "../pageReader/read";
import { robotsAllows } from "../pageReader/robots";

export const ASSET_LIMITS = { cssBytes: 300_000, imageBytes: 5 * 1024 * 1024, stylesheets: 2, redirects: 3, timeoutMs: 15_000 } as const;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;

export type Asset = { url: string; body: Uint8Array; contentType: string };

/** One file, or null. `accept` decides which content types are kept. */
export async function fetchAsset(rawUrl: string, env: ReadEnv, options: { maxBytes: number; accept: (contentType: string) => boolean; acceptHeader: string; partialOk?: boolean }): Promise<Asset | null> {
  const first = parseTarget(rawUrl);
  if (!first.ok) return null;
  let url = first.url;
  for (let hop = 0; hop <= ASSET_LIMITS.redirects; hop += 1) {
    const rules = await robotsFor(url, env);
    if (!robotsAllows(rules, `${url.pathname}${url.search}`)) return null;
    const delayMs = (rules.crawlDelay ?? 0) * 1000;
    if (delayMs > READ_LIMITS.maxCrawlDelayMs) return null;
    const slot = await env.claim(siteKey(url), Math.max(READ_LIMITS.siteGapMs, delayMs), READ_LIMITS.maxWaitMs);
    if ("denied" in slot) return null;
    if (slot.waitMs > 0) await env.sleep(slot.waitMs);
    let response;
    try {
      response = await env.fetch(url, { timeoutMs: ASSET_LIMITS.timeoutMs, maxBytes: options.maxBytes, accept: options.acceptHeader });
    } catch {
      return null;
    }
    const location = response.headers.location;
    if (response.status >= 300 && response.status < 400 && location) {
      let target: string;
      try {
        target = new URL(location, url).href;
      } catch {
        return null;
      }
      const next = parseTarget(target);
      if (!next.ok) return null;
      url = next.url;
      continue;
    }
    if (response.status !== 200 || (response.truncated && !options.partialOk)) return null;
    const contentType = (response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (!options.accept(contentType)) return null;
    return { url: url.href, body: response.body, contentType };
  }
  return null;
}

export function fetchStylesheet(url: string, env: ReadEnv) {
  return fetchAsset(url, env, { maxBytes: ASSET_LIMITS.cssBytes, accept: (type) => type === "text/css" || type === "", acceptHeader: "text/css,*/*;q=0.1", partialOk: true });
}

/** An image of a type a brand kit accepts. An SVG is kept as a file; it is never put into a page as markup. */
export function fetchImage(url: string, env: ReadEnv) {
  return fetchAsset(url, env, {
    maxBytes: ASSET_LIMITS.imageBytes,
    accept: (type) => (IMAGE_TYPES as readonly string[]).includes(type),
    acceptHeader: "image/png,image/jpeg,image/webp,image/svg+xml;q=0.9",
  });
}
