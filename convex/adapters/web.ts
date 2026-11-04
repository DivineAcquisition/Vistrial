import type { Platform } from "../lib/researchShapes";
import { instagramPost, isYoutubeShort, metaAdId, metaAdLibraryUrl, onDomain, platformForUrl, text, tiktokId, toTimestamp, youtubeId } from "./links";
import { MAX_SOURCES_PER_ADAPTER, result, type FoundSource, type SourceAdapter } from "./types";

type SavedWeb = {
  sources?: { url?: unknown; title?: unknown; pageAge?: unknown }[];
  citations?: { url?: unknown; citedText?: unknown }[];
};

/** Domains a run may never keep, whatever the search found. */
export const BLOCKED_DOMAINS: readonly string[] = [];

/** A found link as a source, on the platform its address belongs to. Embeds come only from ids we can read. */
export function sourceFromLink(url: string, origin: FoundSource["origin"], title?: string): FoundSource {
  const platform: Platform = platformForUrl(url);
  const base = { origin, url, title: title ?? url };
  if (platform === "youtube") {
    const id = youtubeId(url);
    return id
      ? { ...base, platform, kind: isYoutubeShort(url) ? "short" : "video", embed: { provider: "youtube", id }, availability: "available" }
      : { ...base, platform, kind: "page", availability: "linkOnly" };
  }
  if (platform === "tiktok") {
    // TikTok embeds are confirmed by its oEmbed check, so until then this is a link.
    return { ...base, platform, kind: tiktokId(url) ? "short" : "page", availability: "linkOnly" };
  }
  if (platform === "instagram") {
    return { ...base, platform, kind: instagramPost(url)?.kind ?? "page", availability: "linkOnly" };
  }
  if (platform === "metaAdLibrary") {
    const id = metaAdId(url)!;
    return { ...base, url: metaAdLibraryUrl(id), platform, kind: "ad", availability: "linkOnly" };
  }
  return { ...base, platform, kind: "page", availability: "linkOnly" };
}

/**
 * 2.7: what Claude's web search and fetch found in this run, as sources. Discovery itself is a model step
 * (the skill sets `webSearch` with `maxUses` and domain lists); this adapter keeps the links, titles,
 * dates and the lines Claude cited, and sorts each link onto its platform. It makes no network call.
 */
export const webAdapter: SourceAdapter = {
  platform: "web",
  async collect(input) {
    if (input.webResults.length === 0) {
      return result("web", "unavailable", "no_search_step", [], "This run did not search the web.");
    }
    const seen = new Set<string>();
    const sources: FoundSource[] = [];
    let unreadable = 0;
    for (const body of input.webResults) {
      let saved: SavedWeb;
      try {
        saved = JSON.parse(body) as SavedWeb;
      } catch {
        unreadable++;
        continue;
      }
      const cited = new Map<string, string>();
      for (const citation of saved.citations ?? []) {
        const line = text(citation.citedText);
        if (typeof citation.url === "string" && line && !cited.has(citation.url)) cited.set(citation.url, line);
      }
      for (const found of saved.sources ?? []) {
        if (typeof found.url !== "string" || seen.has(found.url)) continue;
        if (BLOCKED_DOMAINS.some((domain) => onDomain(found.url as string, domain))) continue;
        seen.add(found.url);
        const source = sourceFromLink(found.url, "found", text(found.title));
        const publishedAt = toTimestamp(found.pageAge);
        const excerpt = cited.get(found.url);
        sources.push({ ...source, ...(publishedAt ? { publishedAt } : {}), ...(excerpt ? { excerpt } : {}) });
      }
    }
    if (unreadable === input.webResults.length) return result("web", "unavailable", "unreadable_results");
    const kept = sources.slice(0, MAX_SOURCES_PER_ADAPTER);
    if (kept.length === 0) return result("web", "available", "no_results");
    return result("web", unreadable > 0 || sources.length > kept.length ? "partial" : "available", "ok", kept);
  },
};
