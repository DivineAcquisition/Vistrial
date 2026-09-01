import { PRODUCTION_APP_ORIGIN, PRODUCTION_FORSIGHT_ORIGIN } from "@/lib/constants";

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
  if (normalized === PRODUCTION_APP_ORIGIN) return true;
  // Signing in from pulse.vistrial.io must land back on pulse.vistrial.io.
  if (normalized === PRODUCTION_FORSIGHT_ORIGIN) return true;
  if (LOCAL_ORIGINS.has(normalized)) return true;
  try {
    const url = new URL(normalized);
    if (url.protocol === "https:" && url.hostname.endsWith(".vercel.app")) {
      return true;
    }
  } catch {
    return false;
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
