import { instagramPost, platformForUrl, text, tiktokId } from "./links";
import { parsePublicUrl } from "../lib/sourceRefs";
import { MAX_LINKS_CHECKED, result, type CollectInput, type CollectEnv, type FoundSource, type SourceAdapter } from "./types";

/** Meta's Graph API version for oEmbed and the Ad Library. v25.0 is supported until July 2028. */
export function graphVersion(env: CollectEnv) {
  const set = env.setting("META_GRAPH_VERSION");
  return set && /^v\d{2}\.0$/.test(set) ? set : "v25.0";
}

/** Links to check for a platform: what the person pasted in first, then what earlier steps found. */
function linksFor(input: CollectInput, platform: "tiktok" | "instagram") {
  const supplied = input.scope.suppliedUrls.filter((url) => platformForUrl(url) === platform);
  const found = (input.knownUrls[platform] ?? []).filter((url) => !supplied.includes(url));
  return [
    ...supplied.map((url) => ({ url, origin: "supplied" as const })),
    ...found.map((url) => ({ url, origin: "found" as const })),
  ].slice(0, MAX_LINKS_CHECKED);
}

/** A TikTok link oEmbed can show: a video, or a short share link that points to one. */
function isTiktokVideoLink(url: string) {
  if (tiktokId(url)) return true;
  const host = parsePublicUrl(url)?.hostname.toLowerCase() ?? "";
  return host === "vm.tiktok.com" || host === "vt.tiktok.com";
}

/** State over the links that were checked. Pages that are not videos or posts are kept as links and not counted. */
function stateOf(checked: number, refused: number) {
  if (checked === 0) return { state: "partial" as const, reasonCode: "no_video_links" };
  if (refused === 0) return { state: "available" as const, reasonCode: "ok" };
  return { state: refused === checked ? ("unavailable" as const) : ("partial" as const), reasonCode: "some_links_unavailable" };
}

const NO_SEARCH = {
  tiktok: "TikTok has no public search. Paste the TikTok links you want analyzed.",
  instagram: "Instagram has no public search. Paste the Instagram links you want analyzed.",
};

/**
 * 2.9 TikTok: links found by web search or pasted in, checked one by one through TikTok's official oEmbed.
 * A link that oEmbed refuses (private, removed, not a video) is kept as unavailable, never guessed at.
 */
export const tiktokAdapter: SourceAdapter = {
  platform: "tiktok",
  async collect(input, env) {
    const links = linksFor(input, "tiktok");
    if (links.length === 0) return result("tiktok", "unavailable", "no_links", [], NO_SEARCH.tiktok);
    const sources: FoundSource[] = [];
    let refused = 0;
    let checked = 0;
    for (const link of links) {
      if (!isTiktokVideoLink(link.url)) {
        sources.push({ ...link, platform: "tiktok", kind: "page", title: link.url, availability: "linkOnly", limitation: "A TikTok profile or topic page, not a video." });
        continue;
      }
      checked++;
      const kind = tiktokId(link.url) ? ("short" as const) : ("page" as const);
      let body: Record<string, unknown> | null = null;
      try {
        const response = await env.fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(link.url)}`);
        body = response.ok ? ((await response.json().catch(() => null)) as Record<string, unknown> | null) : null;
      } catch {
        body = null;
      }
      const id = typeof body?.embed_product_id === "string" && /^\d{8,25}$/.test(body.embed_product_id) ? body.embed_product_id : tiktokId(link.url);
      if (!body || !id) {
        refused++;
        sources.push({ ...link, platform: "tiktok", kind, title: link.url, availability: "unavailable", limitation: "TikTok would not show this video. It may be private or removed." });
        continue;
      }
      sources.push({
        ...link,
        platform: "tiktok",
        kind: "short",
        title: text(body.title) ?? "TikTok video",
        publisher: text(body.author_name),
        embed: { provider: "tiktok", id },
        availability: "available",
      });
    }
    const { state, reasonCode } = stateOf(checked, refused);
    return result("tiktok", state, reasonCode, sources, NO_SEARCH.tiktok);
  },
};

/**
 * 2.9 Instagram: links found by web search or pasted in, checked through Meta's oEmbed. That needs the
 * business's Meta app with oEmbed Read approved. Until then links are kept as link cards and the status
 * says it is awaiting authorization.
 */
export const instagramAdapter: SourceAdapter = {
  platform: "instagram",
  async collect(input, env) {
    const links = linksFor(input, "instagram");
    if (links.length === 0) return result("instagram", "unavailable", "no_links", [], NO_SEARCH.instagram);
    const linkCard = (link: (typeof links)[number], limitation?: string): FoundSource => ({
      ...link,
      platform: "instagram",
      kind: instagramPost(link.url)?.kind ?? "page",
      title: link.url,
      availability: "linkOnly",
      ...(limitation ? { limitation } : {}),
    });
    const appId = env.setting("META_APP_ID");
    const secret = env.setting("META_APP_SECRET");
    if (!appId || !secret) {
      return result("instagram", "awaitingAuthorization", "not_configured", links.map((link) => linkCard(link)), "Instagram previews need the Meta app to be connected. Links are shown instead.");
    }
    const sources: FoundSource[] = [];
    let refused = 0;
    let checked = 0;
    for (const link of links) {
      const post = instagramPost(link.url);
      if (!post) {
        sources.push(linkCard(link, "An Instagram profile or page, not a post."));
        continue;
      }
      checked++;
      const params = new URLSearchParams({ url: link.url, omitscript: "true", fields: "author_name,provider_name" });
      let response;
      try {
        response = await env.fetch(`https://graph.facebook.com/${graphVersion(env)}/instagram_oembed?${params}`, {
          headers: { Authorization: `Bearer ${appId}|${secret}` },
        });
      } catch {
        return result("instagram", "unavailable", "connection_failed", [...sources, ...links.slice(sources.length).map((row) => linkCard(row))]);
      }
      const body = (await response.json().catch(() => null)) as { author_name?: unknown; error?: { code?: number } } | null;
      if (!response.ok) {
        const code = body?.error?.code;
        if (code === 10 || code === 200 || code === 190) {
          // The app itself is not allowed yet: nothing more will work this run.
          const rest = links.slice(sources.length).map((row) => linkCard(row));
          return result("instagram", "awaitingAuthorization", code === 190 ? "token_rejected" : "oembed_not_approved", [...sources, ...rest], "Instagram previews are waiting for Meta to approve the app. Links are shown instead.");
        }
        refused++;
        sources.push({ ...linkCard(link), availability: "unavailable", limitation: "Instagram would not show this post. It may be private or removed." });
        continue;
      }
      sources.push({
        ...link,
        platform: "instagram",
        kind: post.kind,
        title: text(body?.author_name) ? `Instagram ${post.kind} by ${text(body?.author_name)}` : `Instagram ${post.kind}`,
        publisher: text(body?.author_name),
        embed: { provider: "instagram", id: post.code },
        availability: "available",
      });
    }
    const { state, reasonCode } = stateOf(checked, refused);
    return result("instagram", state, reasonCode, sources, NO_SEARCH.instagram);
  },
};
