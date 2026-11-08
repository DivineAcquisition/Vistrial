import { describe, expect, it } from "vitest";

import { runAdapter } from ".";
import { instagramPost, metaAdId, platformForUrl, tiktokId, youtubeId } from "./links";
import { euUkCountry, metaAdLibraryAdapter } from "./metaAdLibrary";
import { instagramAdapter, tiktokAdapter } from "./oembed";
import type { CollectEnv, CollectInput } from "./types";
import { webAdapter } from "./web";
import { youtubeAdapter, youtubeQueries } from "./youtube";

const KEYS = { YOUTUBE_API_KEY: "yt-secret-key", META_APP_ID: "111", META_APP_SECRET: "meta-secret", META_AD_LIBRARY_TOKEN: "lib-secret-token" };

type Reply = { status?: number; body: unknown } | "throw";

/** A fake network: each URL is answered by the first matching rule. Every call is recorded. */
function env(rules: [RegExp, Reply | ((url: string) => Reply)][], settings: Record<string, string> = KEYS) {
  const calls: { url: string; headers?: Record<string, string> }[] = [];
  const e: CollectEnv = {
    setting: (name) => settings[name],
    now: () => 1_700_000_000_000,
    fetch: async (url, init) => {
      calls.push({ url, headers: init?.headers });
      const rule = rules.find(([pattern]) => pattern.test(url));
      if (!rule) throw new Error(`unexpected fetch ${url}`);
      const reply = typeof rule[1] === "function" ? rule[1](url) : rule[1];
      if (reply === "throw") throw new Error("network down");
      const status = reply.status ?? 200;
      return { ok: status < 400, status, json: async () => reply.body };
    },
  };
  return { env: e, calls };
}

function input(overrides: Partial<CollectInput["scope"]> = {}, rest: Partial<CollectInput> = {}): CollectInput {
  return {
    scope: {
      market: "Deep cleaning",
      geography: "Austin, TX",
      competitors: [{ name: "Sparkle Cleaners", url: "https://sparkle.example.com" }],
      platforms: ["web", "youtube", "tiktok", "instagram", "metaAdLibrary"],
      suppliedUrls: [],
      ...overrides,
    },
    webResults: [],
    knownUrls: {},
    ...rest,
  };
}

/** Nothing secret in a result: not in a link, a reason, a limitation or a title. */
function expectNoSecrets(value: unknown) {
  const text = JSON.stringify(value);
  for (const secret of Object.values(KEYS)) if (secret.length > 3) expect(text).not.toContain(secret);
}

describe("links", () => {
  it("reads ids from the official link shapes only", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(youtubeId("https://evil.example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(tiktokId("https://www.tiktok.com/@shop/video/7234567890123456789?lang=en")).toBe("7234567890123456789");
    expect(tiktokId("https://vm.tiktok.com/ZMabc/")).toBeNull();
    expect(instagramPost("https://www.instagram.com/p/Cabc123xyz/")).toEqual({ code: "Cabc123xyz", kind: "post" });
    expect(instagramPost("https://instagram.com/reel/Cabc123xyz")).toEqual({ code: "Cabc123xyz", kind: "reel" });
    expect(instagramPost("https://instagram.com/sparkle/")).toBeNull();
    expect(metaAdId("https://www.facebook.com/ads/library/?id=1234567890")).toBe("1234567890");
    expect(metaAdId("https://www.facebook.com/sparkle")).toBeNull();
    expect(platformForUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("youtube");
    expect(platformForUrl("https://www.tiktok.com/@shop/video/7234567890123456789")).toBe("tiktok");
    expect(platformForUrl("https://facebook.com/ads/library/?id=1234567890")).toBe("metaAdLibrary");
    expect(platformForUrl("https://facebook.com/sparkle")).toBe("web");
    expect(platformForUrl("javascript:alert(1)")).toBe("web");
  });

  it("finds an EU or UK country by name, never by a two-letter code", () => {
    expect(euUkCountry("Austin, TX")).toBeNull();
    expect(euUkCountry("Wilmington, DE")).toBeNull();
    expect(euUkCountry("Belfast, Northern Ireland")).toBe("GB");
    expect(euUkCountry("Dublin")).toBe("IE");
    expect(euUkCountry("Berlin, Germany")).toBe("DE");
    expect(euUkCountry("Leeds, UK")).toBe("GB");
  });
});

describe("web adapter (2.7)", () => {
  const saved = JSON.stringify({
    sources: [
      { url: "https://sparkle.example.com/offers", title: "Sparkle offers", pageAge: "2026-10-01" },
      { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Before and after", pageAge: "3 days ago" },
      { url: "https://www.tiktok.com/@shop/video/7234567890123456789", title: "Clean with me" },
      { url: "https://www.facebook.com/ads/library/?id=1234567890&utm_source=x", title: "Ad" },
      { url: "https://sparkle.example.com/offers", title: "Duplicate" },
    ],
    citations: [{ url: "https://sparkle.example.com/offers", citedText: "  20% off   your first clean  " }],
  });

  it("keeps each found link once, on its platform, with the cited line and a real date", async () => {
    const out = await webAdapter.collect(input({}, { webResults: [saved] }), env([]).env);
    expect(out.state).toBe("available");
    expect(out.sources.map((row) => [row.platform, row.kind, row.availability])).toEqual([
      ["web", "page", "linkOnly"],
      ["youtube", "video", "available"],
      ["tiktok", "short", "linkOnly"],
      ["metaAdLibrary", "ad", "linkOnly"],
    ]);
    expect(out.sources[0].excerpt).toBe("20% off your first clean");
    expect(out.sources[0].publishedAt).toBe(Date.parse("2026-10-01"));
    expect(out.sources[1].publishedAt).toBeUndefined();
    expect(out.sources[1].embed).toEqual({ provider: "youtube", id: "dQw4w9WgXcQ" });
    expect(out.sources[3].url).toBe("https://www.facebook.com/ads/library/?id=1234567890");
  });

  it("says when there was no search, or nothing readable", async () => {
    expect((await webAdapter.collect(input(), env([]).env)).reasonCode).toBe("no_search_step");
    const bad = await webAdapter.collect(input({}, { webResults: ["not json"] }), env([]).env);
    expect([bad.state, bad.reasonCode]).toEqual(["unavailable", "unreadable_results"]);
    const empty = await webAdapter.collect(input({}, { webResults: [JSON.stringify({ sources: [] })] }), env([]).env);
    expect([empty.state, empty.reasonCode]).toEqual(["available", "no_results"]);
  });
});

describe("YouTube adapter (2.8)", () => {
  const search = {
    items: [
      { id: { videoId: "aaaaaaaaaaa" }, snippet: { title: "Deep clean Austin", channelTitle: "Sparkle", publishedAt: "2026-09-01T00:00:00Z", description: "Watch us clean." } },
      { id: { videoId: "not-an-id" }, snippet: { title: "Bad id" } },
    ],
  };

  it("searches with the key in the request only, and shows each video with its official embed", async () => {
    const { env: e, calls } = env([[/googleapis\.com\/youtube\/v3\/search/, { body: search }]]);
    const out = await youtubeAdapter.collect(input({ suppliedUrls: ["https://youtu.be/bbbbbbbbbbb"] }), e);
    expect(out.state).toBe("available");
    expect(out.sources.map((row) => row.embed?.id)).toEqual(["bbbbbbbbbbb", "aaaaaaaaaaa"]);
    expect(out.sources[1]).toMatchObject({ origin: "found", publisher: "Sparkle", excerpt: "Watch us clean.", url: "https://www.youtube.com/watch?v=aaaaaaaaaaa" });
    expect(calls).toHaveLength(youtubeQueries(input().scope).length);
    expect(calls[0].url).toContain("type=video");
    expectNoSecrets(out);
  });

  it("reads a quota error as unavailable with a reason, never as no videos", async () => {
    const quota = { status: 403, body: { error: { errors: [{ reason: "quotaExceeded" }] } } };
    const out = await youtubeAdapter.collect(input(), env([[/youtube/, quota]]).env);
    expect([out.state, out.reasonCode]).toEqual(["unavailable", "quota_exceeded"]);
    expect(out.limitation).toContain("daily search limit");
    let n = 0;
    const second = await youtubeAdapter.collect(input(), env([[/youtube/, () => (n++ === 0 ? { body: search } : quota)]]).env);
    expect([second.state, second.reasonCode, second.sources.length]).toEqual(["partial", "quota_exceeded", 1]);
  });

  it("without a key, shows pasted links and says search is not set up", async () => {
    const out = await youtubeAdapter.collect(input({ suppliedUrls: ["https://youtu.be/bbbbbbbbbbb"] }), env([], {}).env);
    expect([out.state, out.reasonCode, out.sources.length]).toEqual(["partial", "not_configured", 1]);
    const none = await youtubeAdapter.collect(input(), env([], {}).env);
    expect([none.state, none.reasonCode]).toEqual(["unavailable", "not_configured"]);
  });
});

describe("TikTok and Instagram adapters (2.9)", () => {
  const good = "https://www.tiktok.com/@shop/video/7234567890123456789";
  const gone = "https://www.tiktok.com/@shop/video/7999999999999999999";

  it("TikTok: confirms embeds through oEmbed and keeps a refused link as unavailable", async () => {
    const { env: e } = env([
      [/oembed\?url=.*7234567890123456789/, { body: { title: "Clean with me", author_name: "shop", embed_product_id: "7234567890123456789" } }],
      [/oembed/, { status: 404, body: {} }],
    ]);
    const out = await tiktokAdapter.collect(input({ suppliedUrls: [good] }, { knownUrls: { tiktok: [gone, good] } }), e);
    expect([out.state, out.reasonCode]).toEqual(["partial", "some_links_unavailable"]);
    expect(out.sources[0]).toMatchObject({ origin: "supplied", embed: { provider: "tiktok", id: "7234567890123456789" }, availability: "available", publisher: "shop" });
    expect(out.sources[1]).toMatchObject({ origin: "found", availability: "unavailable" });
    expect(out.sources).toHaveLength(2);
  });

  it("TikTok: keeps profile and topic pages as links without calling oEmbed", async () => {
    const { env: e, calls } = env([]);
    const out = await tiktokAdapter.collect(input({}, { knownUrls: { tiktok: ["https://www.tiktok.com/@shop", "https://www.tiktok.com/discover/deep-cleaning"] } }), e);
    expect([out.state, out.reasonCode]).toEqual(["partial", "no_video_links"]);
    expect(out.sources.map((row) => [row.availability, row.limitation])).toEqual([
      ["linkOnly", "A TikTok profile or topic page, not a video."],
      ["linkOnly", "A TikTok profile or topic page, not a video."],
    ]);
    expect(calls).toHaveLength(0);
  });

  it("TikTok: with no links, offers to analyze pasted ones", async () => {
    const out = await tiktokAdapter.collect(input(), env([]).env);
    expect([out.state, out.reasonCode]).toEqual(["unavailable", "no_links"]);
    expect(out.limitation).toContain("Paste the TikTok links");
  });

  it("Instagram: waits for authorization without the Meta app, and keeps links as link cards", async () => {
    const link = "https://www.instagram.com/p/Cabc123xyz/";
    const out = await instagramAdapter.collect(input({ suppliedUrls: [link] }), env([], {}).env);
    expect([out.state, out.reasonCode]).toEqual(["awaitingAuthorization", "not_configured"]);
    expect(out.sources[0]).toMatchObject({ availability: "linkOnly", kind: "post" });
    const pending = await instagramAdapter.collect(input({ suppliedUrls: [link] }), env([[/instagram_oembed/, { status: 400, body: { error: { code: 10 } } }]]).env);
    expect([pending.state, pending.reasonCode]).toEqual(["awaitingAuthorization", "oembed_not_approved"]);
  });

  it("Instagram: embeds an approved post, sends the token in a header only, and keeps a profile as a link", async () => {
    const { env: e, calls } = env([[/instagram_oembed/, { body: { author_name: "sparkle" } }]]);
    const out = await instagramAdapter.collect(input({ suppliedUrls: ["https://instagram.com/reel/Cabc123xyz", "https://instagram.com/sparkle/"] }), e);
    expect([out.state, out.reasonCode]).toEqual(["available", "ok"]);
    expect(out.sources[0]).toMatchObject({ embed: { provider: "instagram", id: "Cabc123xyz" }, availability: "available", publisher: "sparkle" });
    // A profile is kept as a link with an honest note, not sent to oEmbed and not called removed.
    expect(out.sources[1]).toMatchObject({ availability: "linkOnly", limitation: "An Instagram profile or page, not a post." });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).not.toContain("meta-secret");
    expect(calls[0].headers?.Authorization).toBe("Bearer 111|meta-secret");
    expectNoSecrets(out);
  });
});

describe("Meta Ad Library adapter (2.10)", () => {
  const pasted = "https://www.facebook.com/ads/library/?id=1234567890&search_type=page";

  it("outside the EU and UK, says the API does not cover commercial ads and keeps pasted links as cards", async () => {
    const { env: e, calls } = env([]);
    const out = await metaAdLibraryAdapter.collect(input({ suppliedUrls: [pasted] }), e);
    expect([out.state, out.reasonCode]).toEqual(["partial", "commercial_outside_eu_uk"]);
    expect(out.sources[0]).toMatchObject({ url: "https://www.facebook.com/ads/library/?id=1234567890", kind: "ad", availability: "linkOnly" });
    expect(out.limitation).toContain("outside the EU and UK");
    expect(calls).toHaveLength(0);
    const none = await metaAdLibraryAdapter.collect(input(), e);
    expect(none.state).toBe("unavailable");
  });

  it("in the EU or UK, uses the official API, never keeps a snapshot link, and keeps the token out", async () => {
    const ads = {
      data: [
        { id: "5555555555", page_name: "Sparkle Cleaners", ad_creative_bodies: ["Book a deep clean today"], ad_delivery_start_time: "2026-08-01", ad_snapshot_url: "https://www.facebook.com/ads/archive/render_ad/?id=5555555555&access_token=lib-secret-token" },
      ],
    };
    const { env: e, calls } = env([[/ads_archive/, { body: ads }]]);
    const out = await metaAdLibraryAdapter.collect(input({ geography: "London, UK" }), e);
    expect(out.state).toBe("available");
    expect(out.sources[0]).toMatchObject({ url: "https://www.facebook.com/ads/library/?id=5555555555", publisher: "Sparkle Cleaners", excerpt: "Book a deep clean today" });
    expect(decodeURIComponent(calls[0].url)).toContain('ad_reached_countries=["GB"]');
    expect(calls[0].url).not.toContain("ad_snapshot_url");
    expect(calls[0].url).not.toContain("lib-secret-token");
    expectNoSecrets(out);
  });

  it("an expired token or missing access reads as awaiting authorization", async () => {
    const expired = await metaAdLibraryAdapter.collect(input({ geography: "Paris, France" }), env([[/ads_archive/, { status: 400, body: { error: { code: 190 } } }]]).env);
    expect([expired.state, expired.reasonCode]).toEqual(["awaitingAuthorization", "token_rejected"]);
    const denied = await metaAdLibraryAdapter.collect(input({ geography: "Paris, France" }), env([[/ads_archive/, { status: 400, body: { error: { code: 2332004 } } }]]).env);
    expect([denied.state, denied.reasonCode]).toEqual(["awaitingAuthorization", "access_not_granted"]);
    const noToken = await metaAdLibraryAdapter.collect(input({ geography: "Paris, France" }), env([], {}).env);
    expect([noToken.state, noToken.reasonCode]).toEqual(["unavailable", "not_configured"]);
  });
});

describe("runAdapter", () => {
  it("never throws: a broken network reads as unavailable", async () => {
    const out = await runAdapter("source.tiktok", input({ suppliedUrls: ["https://www.tiktok.com/@shop/video/7234567890123456789"] }), env([[/./, "throw"]]).env);
    expect(out.state).toBe("unavailable");
    const broken = await runAdapter("source.youtube", input(), { ...env([]).env, setting: () => { throw new Error("boom"); } });
    expect([broken.state, broken.reasonCode]).toEqual(["unavailable", "adapter_error"]);
  });
});
