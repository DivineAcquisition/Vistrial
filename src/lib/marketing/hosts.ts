import {
  PRODUCTION_APP_ORIGIN,
  PRODUCTION_FORSIGHT_ORIGIN,
  PRODUCTION_SITE_ORIGIN,
  PRODUCTION_STELLAR_ORIGIN,
} from "@/lib/constants";

/** Intended public marketing host once apex DNS points at Vercel. */
export const SITE_HOST = "vistrial.io";

export const WWW_SITE_HOST = "www.vistrial.io";

export function hostnameFromHostHeader(host: string | null | undefined): string {
  return (host ?? "").split(",")[0]?.split(":")[0]?.trim().toLowerCase() ?? "";
}

function hostnameOf(origin: string, fallback: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return fallback;
  }
}

export type ProductHost = "site" | "app" | "pulse" | "stellar" | "local" | "unknown";

/** Marketing site. Apex and www are the same product; do not 308 one to the other. */
export function isSiteHost(host: string | null | undefined): boolean {
  const hostname = hostnameFromHostHeader(host);
  return hostname === SITE_HOST || hostname === WWW_SITE_HOST;
}

/** Host of the operator app. Marketing lives on vistrial.io / www, not here. */
export function isOperatorAppHost(host: string | null | undefined): boolean {
  const hostname = hostnameFromHostHeader(host);
  if (!hostname) return false;
  return hostname === hostnameOf(PRODUCTION_APP_ORIGIN, "app.vistrial.io");
}

/**
 * Host of core Forsight (pulse.vistrial.io). Same app as app.vistrial.io —
 * this hostname is a bookmark into /app/forsight, not Stellar.
 */
export function isForsightHost(host: string | null | undefined): boolean {
  const hostname = hostnameFromHostHeader(host);
  if (!hostname) return false;
  return hostname === hostnameOf(PRODUCTION_FORSIGHT_ORIGIN, "pulse.vistrial.io");
}

/**
 * Host of Stellar (forsight.vistrial.io). A separate product from the
 * operator app: Setter's Log, Client Portal, and the DA Console live under
 * /stellar behind their own login gate.
 */
export function isStellarHost(host: string | null | undefined): boolean {
  const hostname = hostnameFromHostHeader(host);
  if (!hostname) return false;
  return hostname === hostnameOf(PRODUCTION_STELLAR_ORIGIN, "forsight.vistrial.io");
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".vercel.app");
}

/**
 * One hostname, one product. Unknown hosts are not the operator app: they
 * may show marketing, and product paths bounce to the canonical origin.
 */
export function classifyProductHost(host: string | null | undefined): ProductHost {
  const hostname = hostnameFromHostHeader(host);
  if (!hostname) return "local";
  if (isLocalHost(hostname)) return "local";
  if (isOperatorAppHost(hostname)) return "app";
  if (isForsightHost(hostname)) return "pulse";
  if (isStellarHost(hostname)) return "stellar";
  if (isSiteHost(hostname)) return "site";
  return "unknown";
}

export function resolveSiteOrigin(args: {
  explicit?: string | null;
  nodeEnv?: string | null;
}): string {
  if (args.nodeEnv === "production") return PRODUCTION_SITE_ORIGIN;
  const explicit = args.explicit?.trim().replace(/\/$/, "");
  if (explicit) {
    try {
      const hostname = new URL(explicit).hostname.toLowerCase();
      if (hostname === SITE_HOST || hostname === WWW_SITE_HOST) {
        return PRODUCTION_SITE_ORIGIN;
      }
    } catch {
      return explicit;
    }
    return explicit;
  }
  return "http://localhost:3000";
}

/** Canonical origin for sitemap, robots, and Open Graph. Always vistrial.io in production. */
export function siteOrigin(): string {
  return resolveSiteOrigin({
    explicit: process.env.NEXT_PUBLIC_SITE_URL,
    nodeEnv: process.env.NODE_ENV,
  });
}
