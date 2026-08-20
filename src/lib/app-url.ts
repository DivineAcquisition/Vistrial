import { PRODUCTION_APP_ORIGIN } from "@/lib/constants";

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
