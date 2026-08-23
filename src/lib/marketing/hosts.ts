import { PRODUCTION_APP_ORIGIN, PRODUCTION_SITE_ORIGIN } from "@/lib/constants";

/** Public marketing host. No www, no other custom domains. */
export const SITE_HOST = "vistrial.io";

export const WWW_SITE_HOST = "www.vistrial.io";

export function hostnameFromHostHeader(host: string | null | undefined): string {
  return (host ?? "").split(":")[0]?.trim().toLowerCase() ?? "";
}

/** Host of the operator app. Marketing lives on vistrial.io, not here. */
export function isOperatorAppHost(host: string | null | undefined): boolean {
  const hostname = hostnameFromHostHeader(host);
  if (!hostname) return false;
  try {
    return hostname === new URL(PRODUCTION_APP_ORIGIN).hostname;
  } catch {
    return hostname === "app.vistrial.io";
  }
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/**
 * Whether this request should 308 to https://vistrial.io, keeping path and query.
 * The operator app, local dev, API/cron, and Vercel preview URLs stay put.
 */
export function shouldRedirectToSiteHost(args: {
  hostname: string;
  pathname: string;
  vercelEnv?: string | null;
}): boolean {
  const hostname = hostnameFromHostHeader(args.hostname);
  if (!hostname) return false;
  if (hostname === SITE_HOST) return false;
  if (isOperatorAppHost(hostname)) return false;
  if (isLocalHostname(hostname)) return false;
  if (args.pathname === "/api" || args.pathname.startsWith("/api/")) return false;
  if (args.vercelEnv === "preview" && hostname.endsWith(".vercel.app")) return false;
  return true;
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
