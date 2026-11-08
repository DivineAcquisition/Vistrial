import { metaAdId, metaAdLibraryUrl, platformForUrl, text, toTimestamp } from "./links";
import { graphVersion } from "./oembed";
import { result, type FoundSource, type SourceAdapter } from "./types";

/**
 * Countries where Meta's Ad Library API covers commercial ads: the EU and the UK, plus their larger cities.
 * Matched on names in the project's geography. Two-letter codes are not matched: "DE" is also Delaware.
 */
const EU_UK: Record<string, string> = {
  "united kingdom": "GB", uk: "GB", england: "GB", scotland: "GB", wales: "GB", "northern ireland": "GB", britain: "GB",
  austria: "AT", belgium: "BE", bulgaria: "BG", croatia: "HR", cyprus: "CY", czechia: "CZ", "czech republic": "CZ",
  denmark: "DK", estonia: "EE", finland: "FI", france: "FR", germany: "DE", greece: "GR", hungary: "HU",
  ireland: "IE", italy: "IT", latvia: "LV", lithuania: "LT", luxembourg: "LU", malta: "MT", netherlands: "NL",
  poland: "PL", portugal: "PT", romania: "RO", slovakia: "SK", slovenia: "SI", spain: "ES", sweden: "SE",
  london: "GB", manchester: "GB", dublin: "IE", paris: "FR", berlin: "DE", madrid: "ES", amsterdam: "NL",
};

/** The EU or UK country a geography names, or null. */
export function euUkCountry(geography: string): string | null {
  const words = ` ${geography.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ")} `;
  // "northern ireland" must win over "ireland".
  const names = Object.keys(EU_UK).sort((a, b) => b.length - a.length);
  for (const name of names) if (words.includes(` ${name} `)) return EU_UK[name];
  return null;
}

export const OUTSIDE_COVERAGE =
  "Meta's Ad Library API does not cover commercial ads outside the EU and UK. Paste Ad Library links and they are shown as link cards.";

type ArchiveAd = { id?: unknown; page_name?: unknown; ad_creative_bodies?: unknown; ad_delivery_start_time?: unknown };

/**
 * 2.10: Meta Ad Library. Pasted Ad Library links become link cards (no rehosting). The official
 * `ads_archive` API is used only where it covers commercial ads, the EU and UK. Elsewhere the status says so.
 * The API's `ad_snapshot_url` carries the access token, so it is never requested or stored; links are
 * rebuilt from the ad id.
 */
export const metaAdLibraryAdapter: SourceAdapter = {
  platform: "metaAdLibrary",
  async collect(input, env) {
    const cards: FoundSource[] = [];
    const seen = new Set<string>();
    const pasted = [...input.scope.suppliedUrls.map((url) => ({ url, origin: "supplied" as const })), ...(input.knownUrls.metaAdLibrary ?? []).map((url) => ({ url, origin: "found" as const }))];
    for (const link of pasted) {
      if (platformForUrl(link.url) !== "metaAdLibrary") continue;
      const id = metaAdId(link.url)!;
      if (seen.has(id)) continue;
      seen.add(id);
      cards.push({ origin: link.origin, platform: "metaAdLibrary", kind: "ad", url: metaAdLibraryUrl(id), title: `Meta ad ${id}`, availability: "linkOnly" });
    }
    const country = euUkCountry(input.scope.geography);
    if (!country) {
      return result("metaAdLibrary", cards.length ? "partial" : "unavailable", "commercial_outside_eu_uk", cards, OUTSIDE_COVERAGE);
    }
    const token = env.setting("META_AD_LIBRARY_TOKEN");
    if (!token) {
      return result("metaAdLibrary", cards.length ? "partial" : "unavailable", "not_configured", cards, "The Ad Library connection is not set up yet. Pasted links are still shown.");
    }
    const terms = [...new Set(input.scope.competitors.map((row) => row.name.trim()).filter(Boolean))].slice(0, 3);
    if (terms.length === 0) terms.push(input.scope.market.trim());
    let searched = 0;
    for (const term of terms) {
      const params = new URLSearchParams({
        search_terms: term,
        ad_reached_countries: JSON.stringify([country]),
        ad_type: "ALL",
        ad_active_status: "ALL",
        fields: "id,page_name,ad_creative_bodies,ad_delivery_start_time",
        limit: "10",
      });
      let response;
      try {
        response = await env.fetch(`https://graph.facebook.com/${graphVersion(env)}/ads_archive?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      } catch {
        return result("metaAdLibrary", searched || cards.length ? "partial" : "unavailable", "connection_failed", cards);
      }
      const body = (await response.json().catch(() => null)) as { data?: ArchiveAd[]; error?: { code?: number } } | null;
      if (!response.ok) {
        const code = body?.error?.code;
        if (code === 190) return result("metaAdLibrary", "awaitingAuthorization", "token_rejected", cards, "The Ad Library token has expired. A new one is needed.");
        if (code === 10 || code === 200 || code === 2332002 || code === 2332004) {
          return result("metaAdLibrary", "awaitingAuthorization", "access_not_granted", cards, "Meta has not granted Ad Library API access yet (identity check and terms).");
        }
        if (code === 4 || code === 17 || code === 613) return result("metaAdLibrary", searched || cards.length ? "partial" : "unavailable", "rate_limited", cards);
        return result("metaAdLibrary", searched || cards.length ? "partial" : "unavailable", "provider_error", cards);
      }
      searched++;
      for (const ad of body?.data ?? []) {
        const id = typeof ad.id === "string" && /^\d{5,25}$/.test(ad.id) ? ad.id : null;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const page = text(ad.page_name);
        const bodies = Array.isArray(ad.ad_creative_bodies) ? ad.ad_creative_bodies : [];
        cards.push({
          origin: "found",
          platform: "metaAdLibrary",
          kind: "ad",
          url: metaAdLibraryUrl(id),
          title: page ? `${page} ad` : `Meta ad ${id}`,
          publisher: page,
          publishedAt: toTimestamp(ad.ad_delivery_start_time),
          excerpt: text(bodies[0]),
          availability: "linkOnly",
        });
      }
    }
    return result("metaAdLibrary", "available", cards.length ? "ok" : "no_results", cards);
  },
};
