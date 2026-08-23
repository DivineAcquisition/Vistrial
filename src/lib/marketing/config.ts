import { siteOrigin } from "@/lib/marketing/hosts";

export const AUDIT_BOOKING_PATH = "/book";
export const AUDIT_CALENDAR_PATH = "/book/calendar";

export const GHL_BOOKING_EMBED_SCRIPT_DEFAULT =
  "https://link.msgsndr.com/js/form_embed.js";

/**
 * Inline GHL calendar widget. Set NEXT_PUBLIC_AUDIT_BOOKING_WIDGET_SRC to the
 * HighLevel “Share → Embed” iframe src for the Lead Leak Audit calendar.
 * Without it the survey still submits; the calendar page says so plainly.
 */
export function auditBookingWidgetSrc(): string {
  return process.env.NEXT_PUBLIC_AUDIT_BOOKING_WIDGET_SRC?.trim() ?? "";
}

export function auditBookingEmbedScript(): string {
  return (
    process.env.NEXT_PUBLIC_AUDIT_BOOKING_EMBED_SCRIPT?.trim() ||
    GHL_BOOKING_EMBED_SCRIPT_DEFAULT
  );
}

/** HighLevel Marketplace listing. Empty until the listing is live — do not invent one. */
export function ghlMarketplaceListingUrl(): string {
  return process.env.NEXT_PUBLIC_GHL_MARKETPLACE_URL?.trim() ?? "";
}

export function auditGhlWebhookUrl(): string {
  return process.env.AUDIT_GHL_WEBHOOK_URL?.trim() ?? "";
}

export function marketingEventsWebhookUrl(): string {
  return process.env.MARKETING_EVENTS_WEBHOOK_URL?.trim() ?? "";
}

export type CtaPosition = "nav" | "hero" | "audit";

export function bookingHref(position: CtaPosition): string {
  return `${AUDIT_BOOKING_PATH}?from=${position}`;
}

export function calendarHref(from?: string | null): string {
  if (!from) return AUDIT_CALENDAR_PATH;
  return `${AUDIT_CALENDAR_PATH}?from=${encodeURIComponent(from)}`;
}

export function absoluteUrl(path: string): string {
  const origin = siteOrigin();
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export const PREFILL_COOKIE = "vistrial_audit_prefill";

export const TRACKING_PARAM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "gbraid",
  "wbraid",
  "ttclid",
  "msclkid",
  "li_fat_id",
  "ref",
  "from",
] as const;

export type TrackingParamKey = (typeof TRACKING_PARAM_KEYS)[number];

export type SearchParams = Record<string, string | string[] | undefined>;

export function trackingFromSearchParams(
  searchParams: SearchParams
): Partial<Record<TrackingParamKey, string>> {
  const tracking: Partial<Record<TrackingParamKey, string>> = {};
  for (const key of TRACKING_PARAM_KEYS) {
    const value = searchParams[key];
    const single = Array.isArray(value) ? value[0] : value;
    if (single) tracking[key] = single;
  }
  return tracking;
}

export function withWidgetPrefill(
  widgetSrc: string,
  prefill: { firstName: string; lastName: string; email: string; phone: string }
): string {
  const url = new URL(widgetSrc);
  if (prefill.firstName) url.searchParams.set("first_name", prefill.firstName);
  if (prefill.lastName) url.searchParams.set("last_name", prefill.lastName);
  const fullName = [prefill.firstName, prefill.lastName].filter(Boolean).join(" ");
  if (fullName) url.searchParams.set("name", fullName);
  if (prefill.email) url.searchParams.set("email", prefill.email);
  if (prefill.phone) url.searchParams.set("phone", prefill.phone);
  return url.toString();
}
