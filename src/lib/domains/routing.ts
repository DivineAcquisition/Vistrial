import {
  PRODUCTION_APP_ORIGIN,
  PRODUCTION_FORSIGHT_ORIGIN,
  PRODUCTION_SITE_ORIGIN,
  PRODUCTION_STELLAR_ORIGIN,
} from "@/lib/constants";
import {
  classifyProductHost,
  hostnameFromHostHeader,
  type ProductHost,
} from "@/lib/marketing/hosts";
import { FORSIGHT_PATH } from "@/lib/navigation";

/**
 * One hostname, one product.
 *
 *   vistrial.io / www.vistrial.io  → marketing site
 *   app.vistrial.io                → core operator app
 *   pulse.vistrial.io              → core Forsight (same app, different front door)
 *   forsight.vistrial.io           → Stellar
 *
 * Localhost and Vercel previews serve every product so development still works
 * on a single host. Unknown production hosts never serve /app or /stellar.
 */

export type CanonicalOrigin = "site" | "app" | "pulse" | "stellar";

export type HostRouteDecision =
  | { action: "allow" }
  | {
      action: "redirect";
      origin: "same" | CanonicalOrigin;
      pathname: string;
      preserveSearch: boolean;
    };

export function canonicalOriginUrl(origin: CanonicalOrigin): string {
  switch (origin) {
    case "site":
      return PRODUCTION_SITE_ORIGIN;
    case "app":
      return PRODUCTION_APP_ORIGIN;
    case "pulse":
      return PRODUCTION_FORSIGHT_ORIGIN;
    case "stellar":
      return PRODUCTION_STELLAR_ORIGIN;
  }
}

function pathIs(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function isStaticAsset(path: string): boolean {
  if (path.startsWith("/_next/")) return true;
  if (path === "/favicon.ico" || path === "/sw.js") return true;
  if (path.startsWith("/icons/") || path.startsWith("/brand/")) return true;
  return /\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$/i.test(path);
}

function isMetadataPath(path: string): boolean {
  return (
    path === "/robots.txt" ||
    path === "/sitemap.xml" ||
    path === "/manifest.webmanifest" ||
    path === "/manifest.json" ||
    /^\/(opengraph-image|twitter-image|icon|apple-icon)/.test(path)
  );
}

export function isAuthPath(path: string): boolean {
  return (
    path === "/login" ||
    path === "/no-access" ||
    pathIs(path, "/auth") ||
    pathIs(path, "/accept-invite")
  );
}

export function isMarketingPath(path: string): boolean {
  return (
    path === "/privacy" ||
    path === "/terms" ||
    path === "/disclaimer" ||
    path === "/contact" ||
    pathIs(path, "/book")
  );
}

export function isCoreAppPath(path: string): boolean {
  return pathIs(path, "/app") || pathIs(path, "/portal");
}

export function isStellarPath(path: string): boolean {
  return pathIs(path, "/stellar");
}

function isApiPath(path: string): boolean {
  return pathIs(path, "/api");
}

function isMarketingApi(path: string): boolean {
  return pathIs(path, "/api/marketing");
}

function isHealthApi(path: string): boolean {
  return pathIs(path, "/api/health");
}

function isPublicWebHost(product: ProductHost): boolean {
  return product === "site" || product === "unknown";
}

function bounce(
  origin: CanonicalOrigin,
  pathname: string,
  preserveSearch = true
): HostRouteDecision {
  return { action: "redirect", origin, pathname, preserveSearch };
}

function frontDoor(pathname: string): HostRouteDecision {
  return { action: "redirect", origin: "same", pathname, preserveSearch: false };
}

/**
 * Where a path on this host should go. Pure: Proxy applies the decision.
 */
export function resolveHostRoute(args: {
  host: string | null | undefined;
  pathname: string;
}): HostRouteDecision {
  const product = classifyProductHost(args.host);
  const path = args.pathname || "/";

  if (product === "local") return { action: "allow" };
  if (isStaticAsset(path) || isMetadataPath(path)) return { action: "allow" };

  if (product === "app") return routeAppHost(path);
  if (product === "pulse") return routePulseHost(path);
  if (product === "stellar") return routeStellarHost(path);
  if (isPublicWebHost(product)) return routeSiteHost(path);

  return bounce("site", "/");
}

function routeSiteHost(path: string): HostRouteDecision {
  if (path === "/") return { action: "allow" };
  if (isMarketingPath(path)) return { action: "allow" };
  if (isMarketingApi(path) || isHealthApi(path)) return { action: "allow" };
  if (isAuthPath(path)) return bounce("app", path);
  if (isStellarPath(path)) return bounce("stellar", path);
  if (pathIs(path, FORSIGHT_PATH)) return bounce("pulse", path);
  if (isCoreAppPath(path) || isApiPath(path)) return bounce("app", path);
  return bounce("site", "/");
}

function routeAppHost(path: string): HostRouteDecision {
  if (path === "/") return frontDoor("/login");
  if (isMarketingPath(path)) return bounce("site", path, false);
  if (isStellarPath(path)) return bounce("stellar", path);
  if (isAuthPath(path) || isCoreAppPath(path) || isApiPath(path)) {
    return { action: "allow" };
  }
  return bounce("site", "/");
}

function routePulseHost(path: string): HostRouteDecision {
  if (path === "/") return frontDoor(FORSIGHT_PATH);
  if (isMarketingPath(path)) return bounce("site", path, false);
  if (isStellarPath(path)) return bounce("stellar", path);
  if (isAuthPath(path) || isCoreAppPath(path) || isApiPath(path)) {
    return { action: "allow" };
  }
  return bounce("site", "/");
}

function routeStellarHost(path: string): HostRouteDecision {
  if (path === "/") return frontDoor("/stellar");
  if (isMarketingPath(path)) return bounce("site", path, false);
  if (isStellarPath(path) || isAuthPath(path)) return { action: "allow" };
  if (isHealthApi(path)) return { action: "allow" };
  if (isCoreAppPath(path) || isApiPath(path)) return bounce("app", path);
  return bounce("site", "/");
}

/** Absolute URL for a redirect decision, or null when the request may proceed. */
export function resolvedHostLocation(args: {
  host: string;
  pathname: string;
  search?: string;
  protocol?: string;
}): string | null {
  const decision = resolveHostRoute(args);
  if (decision.action === "allow") return null;

  const origin =
    decision.origin === "same"
      ? `${args.protocol ?? "https"}://${hostnameFromHostHeader(args.host)}`
      : canonicalOriginUrl(decision.origin);

  const url = new URL(origin);
  url.pathname = decision.pathname;
  if (decision.preserveSearch && args.search) {
    url.search = args.search.replace(/^\?/, "");
  }
  return url.toString();
}
