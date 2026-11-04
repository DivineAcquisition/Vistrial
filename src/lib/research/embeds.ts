/**
 * Official embed players only. Each URL is built from an id we parsed ourselves, never from page text,
 * and the board loads it only when a person clicks, so no third party is contacted before then.
 */
export type Embed = { provider: "youtube" | "tiktok" | "instagram"; id: string };

const SAFE_ID = /^[A-Za-z0-9_-]{5,40}$/;

export function embedUrl(embed: Embed, kind: string): string | null {
  if (!SAFE_ID.test(embed.id)) return null;
  switch (embed.provider) {
    case "youtube":
      // youtube-nocookie: YouTube's privacy-enhanced mode, which sets no cookies until the video plays.
      return `https://www.youtube-nocookie.com/embed/${embed.id}`;
    case "tiktok":
      return /^\d{8,25}$/.test(embed.id) ? `https://www.tiktok.com/player/v1/${embed.id}` : null;
    case "instagram":
      return `https://www.instagram.com/${kind === "reel" ? "reel" : "p"}/${embed.id}/embed/`;
  }
}

/** A tall player for short vertical video, a wide one for the rest. */
export function embedShape(embed: Embed, kind: string) {
  if (embed.provider === "tiktok" || kind === "short" || kind === "reel") return "aspect-[9/16] max-h-[32rem]";
  if (embed.provider === "instagram") return "aspect-[4/5] max-h-[36rem]";
  return "aspect-video";
}
