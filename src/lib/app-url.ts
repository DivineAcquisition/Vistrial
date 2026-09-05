import { PRODUCTION_APP_ORIGIN } from "@/lib/constants";
import { classifyProductHost } from "@/lib/marketing/hosts";

const LOCAL_ORIGINS = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);

/**
 * Absolute origin for invites, auth callbacks, and GHL OAuth/webhooks.
 * Production falls back to app.vistrial.io so a missing env cannot mint
 * localhost links. Local `next dev` still defaults to localhost.
 */
export function resolveAppUrl(args: {
  explicit?: string | null;
  nodeEnv?: string | null;
}): string {
  const explicit = args.explicit?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (args.nodeEnv === "production") return PRODUCTION_APP_ORIGIN;
  return "http://localhost:3000";
}

export function appUrl(): string {
  return resolveAppUrl({
    explicit: process.env.NEXT_PUBLIC_APP_URL,
    nodeEnv: process.env.NODE_ENV,
  });
}

/** Hosts we will put on a magic-link redirect. Rejects Host-header injection. */
export function isAllowedAppOrigin(origin: string): boolean {
  const normalized = origin.trim().replace(/\/$/, "");
  if (!normalized) return false;
  if (LOCAL_ORIGINS.has(normalized)) return true;

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return false;
  }

  const product = classifyProductHost(url.hostname);
  if (product === "local") {
    return url.protocol === "http:" || url.protocol === "https:";
  }
  if (product === "app" || product === "pulse" || product === "stellar") {
    return url.protocol === "https:";
  }
  return false;
}

export function originFromForwardedHost(args: {
  host?: string | null;
  proto?: string | null;
}): string | null {
  const host = args.host?.split(",")[0]?.trim();
  if (!host) return null;
  const proto = (args.proto?.split(",")[0]?.trim() || "https").replace(/:$/, "");
  const origin = `${proto}://${host}`.replace(/\/$/, "");
  return isAllowedAppOrigin(origin) ? origin : null;
}
