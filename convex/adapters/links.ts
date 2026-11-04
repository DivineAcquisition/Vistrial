import type { Platform } from "../lib/researchShapes";
import { parsePublicUrl } from "../lib/sourceRefs";

/** Host without "www." or "m.", lower case. */
function host(url: URL) {
  return url.hostname.toLowerCase().replace(/^(www|m)\./, "");
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** The video id of a YouTube watch, short, embed or youtu.be link. */
export function youtubeId(raw: string): string | null {
  const url = parsePublicUrl(raw);
  if (!url) return null;
  const h = host(url);
  let id: string | null = null;
  if (h === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (h === "youtube.com" || h === "music.youtube.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const match = url.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/);
      id = match?.[2] ?? null;
    }
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

export function isYoutubeShort(raw: string) {
  return /\/shorts\//.test(parsePublicUrl(raw)?.pathname ?? "");
}

/** The numeric id of a TikTok video link (`/@name/video/123`). Short `vm.tiktok.com` links have none until resolved. */
export function tiktokId(raw: string): string | null {
  const url = parsePublicUrl(raw);
  if (!url || !host(url).endsWith("tiktok.com")) return null;
  return url.pathname.match(/\/video\/(\d{8,25})/)?.[1] ?? null;
}

/** The shortcode and kind of an Instagram post or reel link. */
export function instagramPost(raw: string): { code: string; kind: "post" | "reel" } | null {
  const url = parsePublicUrl(raw);
  if (!url || host(url) !== "instagram.com") return null;
  const match = url.pathname.match(/^\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,40})/);
  if (!match) return null;
  return { code: match[2], kind: match[1] === "p" ? "post" : "reel" };
}

/** The ad id of a Meta Ad Library link (`facebook.com/ads/library/?id=123`). */
export function metaAdId(raw: string): string | null {
  const url = parsePublicUrl(raw);
  if (!url || host(url) !== "facebook.com" || !url.pathname.startsWith("/ads/library")) return null;
  const id = url.searchParams.get("id");
  return id && /^\d{5,25}$/.test(id) ? id : null;
}

/** The public Ad Library page for an ad. Built from the id, so no token-bearing link is ever stored. */
export function metaAdLibraryUrl(id: string) {
  return `https://www.facebook.com/ads/library/?id=${id}`;
}

/** Which platform a link belongs to. Anything else is a web page. */
export function platformForUrl(raw: string): Platform {
  const url = parsePublicUrl(raw);
  if (!url) return "web";
  const h = host(url);
  if (h === "youtube.com" || h === "youtu.be" || h === "music.youtube.com") return "youtube";
  if (h === "tiktok.com" || h.endsWith(".tiktok.com")) return "tiktok";
  if (h === "instagram.com") return "instagram";
  if (metaAdId(raw)) return "metaAdLibrary";
  return "web";
}

/** True when the link's host is the domain or under it. */
export function onDomain(raw: string, domain: string) {
  const url = parsePublicUrl(raw);
  if (!url) return false;
  const h = url.hostname.toLowerCase();
  const d = domain.toLowerCase().replace(/^\*\./, "").replace(/^www\./, "");
  return h === d || h.endsWith(`.${d}`);
}

/** A date an adapter was given, as a timestamp, or undefined when it is not a real date. */
export function toTimestamp(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const time = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(time) && time > 0 ? time : undefined;
}

/** Plain text from an outside field, cut to a length. Outside text is data, kept short. */
export function text(value: unknown, max = 300): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : undefined;
}
