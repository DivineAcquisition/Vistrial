import { text, toTimestamp, youtubeId } from "./links";
import { result, type FoundSource, type SourceAdapter } from "./types";

/** Each search costs 100 of the app's 10,000 daily quota units, so one run makes few. */
export const YOUTUBE_MAX_SEARCHES = 2;
export const YOUTUBE_RESULTS_PER_SEARCH = 10;

type SearchItem = {
  id?: { videoId?: unknown };
  snippet?: { title?: unknown; channelTitle?: unknown; publishedAt?: unknown; description?: unknown };
};

/** Searches for this project: the market where it is, then each competitor by name. */
export function youtubeQueries(scope: { market: string; geography: string; competitors: { name: string }[] }) {
  const queries = [`${scope.market} ${scope.geography}`.trim(), ...scope.competitors.map((row) => row.name.trim())];
  return [...new Set(queries.filter(Boolean))].slice(0, YOUTUBE_MAX_SEARCHES);
}

function failureCode(status: number, body: unknown) {
  const reason = (body as { error?: { errors?: { reason?: string }[] } })?.error?.errors?.[0]?.reason;
  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded" || reason === "rateLimitExceeded") return "quota_exceeded";
  if (reason === "keyInvalid" || reason === "accessNotConfigured" || status === 401) return "key_rejected";
  return "provider_error";
}

/**
 * 2.8: the YouTube Data API's official search, plus any YouTube links the person pasted in or the web search
 * found. Every video is shown with YouTube's own iframe embed, from its id. Quota errors read as unavailable
 * with a reason, never as "no videos".
 */
export const youtubeAdapter: SourceAdapter = {
  platform: "youtube",
  async collect(input, env) {
    const sources: FoundSource[] = [];
    const seen = new Set<string>();
    const add = (id: string, source: Omit<FoundSource, "platform" | "embed" | "availability" | "url"> & { url?: string }) => {
      if (seen.has(id)) return;
      seen.add(id);
      sources.push({ ...source, url: source.url ?? `https://www.youtube.com/watch?v=${id}`, platform: "youtube", embed: { provider: "youtube", id }, availability: "available" });
    };
    for (const url of input.scope.suppliedUrls) {
      const id = youtubeId(url);
      if (id) add(id, { origin: "supplied", kind: /\/shorts\//.test(url) ? "short" : "video", url, title: url });
    }
    const key = env.setting("YOUTUBE_API_KEY");
    if (!key) {
      return result("youtube", sources.length ? "partial" : "unavailable", "not_configured", sources, "YouTube search is not set up yet. Pasted YouTube links are still shown.");
    }
    let failed: string | null = null;
    let searched = 0;
    for (const q of youtubeQueries(input.scope)) {
      const params = new URLSearchParams({ part: "snippet", type: "video", maxResults: String(YOUTUBE_RESULTS_PER_SEARCH), q, key });
      let response;
      try {
        response = await env.fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
      } catch {
        failed = "connection_failed";
        break;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        failed = failureCode(response.status, body);
        break;
      }
      searched++;
      for (const item of ((body as { items?: SearchItem[] })?.items ?? [])) {
        const id = typeof item.id?.videoId === "string" ? item.id.videoId : null;
        if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) continue;
        add(id, {
          origin: "found",
          kind: "video",
          title: text(item.snippet?.title) ?? "YouTube video",
          publisher: text(item.snippet?.channelTitle),
          publishedAt: toTimestamp(item.snippet?.publishedAt),
          excerpt: text(item.snippet?.description),
        });
      }
    }
    if (failed) {
      const limitation = failed === "quota_exceeded" ? "YouTube's daily search limit was reached. Try again tomorrow." : "YouTube search could not be reached.";
      return result("youtube", searched > 0 || sources.length > 0 ? "partial" : "unavailable", failed, sources, limitation);
    }
    return result("youtube", "available", sources.length ? "ok" : "no_results", sources);
  },
};
