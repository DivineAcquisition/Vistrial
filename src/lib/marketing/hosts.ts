import { PRODUCTION_APP_ORIGIN, PRODUCTION_SITE_ORIGIN } from "@/lib/constants";

/** Host of the operator app. Marketing lives on vistrial.io, not here. */
export function isOperatorAppHost(host: string | null | undefined): boolean {
  const hostname = (host ?? "").split(":")[0]?.trim().toLowerCase();
  if (!hostname) return false;
  try {
    return hostname === new URL(PRODUCTION_APP_ORIGIN).hostname;
  } catch {
    return hostname === "app.vistrial.io";
  }
}

export function siteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  if (process.env.NODE_ENV === "production") return PRODUCTION_SITE_ORIGIN;
  return "http://localhost:3000";
}
