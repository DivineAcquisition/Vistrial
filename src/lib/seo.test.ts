import { describe, expect, it } from "vitest";

import { PRICING_DISPLAY } from "@/lib/marketing/pricing";
import { NEVER_LISTED, PRIVATE_PREFIXES, PUBLIC_PAGES, homeJsonLd, jsonLdScript, robotsDisallow, sitemapEntries } from "@/lib/seo";

const ORIGIN = "https://vistrial.io";
const LIVE = { privacyLive: true, termsLive: true };

describe("sitemap", () => {
  it("lists the public pages the owner named", () => {
    const urls = sitemapEntries(ORIGIN, LIVE).map((row) => row.url);
    for (const path of ["/request", "/contact", "/security", "/security/subprocessors", "/privacy", "/terms", "/cookies", "/disclaimer", "/bot"]) {
      expect(urls).toContain(`${ORIGIN}${path}`);
    }
    expect(urls).toContain(ORIGIN);
  });

  it("never lists the app or sign-in", () => {
    const paths = sitemapEntries(ORIGIN, LIVE).map((row) => row.url.slice(ORIGIN.length) || "/");
    for (const path of paths) expect(NEVER_LISTED.some((prefix) => path.startsWith(prefix))).toBe(false);
  });

  it("holds back privacy and terms until they are live, and robots keeps them out meanwhile", () => {
    const drafts = { privacyLive: false, termsLive: false };
    const urls = sitemapEntries(ORIGIN, drafts).map((row) => row.url);
    expect(urls).not.toContain(`${ORIGIN}/privacy`);
    expect(urls).not.toContain(`${ORIGIN}/terms`);
    expect(robotsDisallow(drafts)).toEqual(expect.arrayContaining(["/privacy", "/terms"]));
    expect(robotsDisallow(LIVE)).not.toContain("/privacy");
  });
});

describe("robots", () => {
  it("keeps the app out, lets sign-in be fetched so its noindex is seen, and does not block a listed page", () => {
    const disallow = robotsDisallow(LIVE);
    expect(disallow).toEqual(expect.arrayContaining(["/app", "/admin", "/dev/"]));
    expect(disallow).not.toContain("/sign-in");
    for (const page of PUBLIC_PAGES) {
      if (page.path === "/") continue;
      expect(PRIVATE_PREFIXES.some((prefix) => page.path.startsWith(prefix))).toBe(false);
    }
  });
});

describe("home structured data", () => {
  it("names the operator and states only the price the pricing section shows", () => {
    const data = homeJsonLd(ORIGIN);
    const text = JSON.stringify(data);
    expect(text).toContain("Divine Agency LLC");
    expect(text).toContain("contact@vistrial.io");
    expect(text).toContain("The agentic workforce for business growth.");
    expect(PRICING_DISPLAY.privateAccess.price).toContain("$179 per month");
    expect(PRICING_DISPLAY.privateAccess.price).toContain("15,000 credits");
    expect(text).toContain(PRICING_DISPLAY.privateAccess.price);
    expect(text).not.toMatch(/aggregateRating|review|ratingValue/i);
  });

  it("escapes < so the payload cannot close its script tag", () => {
    expect(jsonLdScript({ a: "</script><script>" })).not.toContain("<");
  });
});
