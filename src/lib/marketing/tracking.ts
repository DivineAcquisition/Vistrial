import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export { googleAnalyticsId, metaPixelId, GA_ID_PATTERN, META_PIXEL_PATTERN } from "@/lib/marketing/tracking-ids";

export type TrackingCategory = "essential" | "analytics" | "advertising";

export type TrackingTool = {
  slug: string;
  name: string;
  company: string;
  category: TrackingCategory;
  purpose: string;
  collects: string;
  storage: string;
  duration: string;
  privacyUrl: string;
  enabled: boolean;
};

export type TrackingSettings = {
  version: number;
  lifetimeDays: number;
  dismissDays: number;
};

export const FALLBACK_TRACKING_TOOLS: TrackingTool[] = [
  {
    slug: "session",
    name: "Sign-in and security",
    company: "Vistrial",
    category: "essential",
    purpose: "Keeps you signed in and remembers which workspace is open.",
    collects: "A session token and the workspace id. No advertising identifier.",
    storage: "sb-vistrial-session, vistrial_org",
    duration: "Session cookie, and the workspace cookie for up to 400 days.",
    privacyUrl: "https://vistrial.io/privacy",
    enabled: true,
  },
  {
    slug: "turnstile",
    name: "Form abuse check",
    company: "Cloudflare",
    category: "essential",
    purpose: "Checks that a form was sent by a person, only when a site key is configured.",
    collects: "A challenge result. It is not used to advertise.",
    storage: "Cloudflare may set a short-lived cookie on the form page.",
    duration: "For the form session.",
    privacyUrl: "https://www.cloudflare.com/privacypolicy/",
    enabled: true,
  },
  {
    slug: "consent",
    name: "Cookie choice",
    company: "Vistrial",
    category: "essential",
    purpose: "Remembers whether you allowed analytics or advertising on this browser.",
    collects: "The categories you chose, a version number, and the date. No name or email.",
    storage: "vistrial_consent",
    duration: "12 months for an explicit choice, or 30 days if you close the banner without choosing.",
    privacyUrl: "https://vistrial.io/cookies",
    enabled: true,
  },
  {
    slug: "first-party",
    name: "Page counts",
    company: "Vistrial",
    category: "analytics",
    purpose: "Counts which public pages are viewed, as a daily total.",
    collects: "Event type and page path. Not your name, email, or a cross-site cookie.",
    storage: "None beyond the cookie choice.",
    duration: "Daily totals are kept as operational counts.",
    privacyUrl: "https://vistrial.io/privacy",
    enabled: true,
  },
  {
    slug: "google-analytics",
    name: "Google Analytics",
    company: "Google",
    category: "analytics",
    purpose: "Measures which public pages are viewed and how visitors reach the site.",
    collects: "Pages, device and browser type, approximate location, and referring page. No name, email, or form answers.",
    storage: "Google Analytics cookies on this site, only after you allow analytics.",
    duration: "Google's shortest retention setting for this property.",
    privacyUrl: "https://policies.google.com/privacy",
    enabled: false,
  },
  {
    slug: "meta-pixel",
    name: "Meta pixel",
    company: "Meta",
    category: "advertising",
    purpose: "Measures our own ads and whether a public form was submitted.",
    collects: "That a public page was viewed or a form was submitted. No name, email, phone, or form answers.",
    storage: "Meta cookies, only after you allow advertising.",
    duration: "Set by Meta on its own domains. Cookies Meta sets on our domain are cleared when you turn advertising off.",
    privacyUrl: "https://www.facebook.com/privacy/policy/",
    enabled: false,
  },
];

export const FALLBACK_TRACKING_SETTINGS: TrackingSettings = {
  version: CONSENT_VERSION_FALLBACK(),
  lifetimeDays: 365,
  dismissDays: 30,
};

function CONSENT_VERSION_FALLBACK(): number {
  return 1;
}

function asTool(row: Record<string, unknown>): TrackingTool | null {
  const category = row.category;
  if (category !== "essential" && category !== "analytics" && category !== "advertising") return null;
  return {
    slug: String(row.slug ?? ""),
    name: String(row.name ?? ""),
    company: String(row.company ?? ""),
    category,
    purpose: String(row.purpose ?? ""),
    collects: String(row.collects ?? ""),
    storage: String(row.storage ?? ""),
    duration: String(row.duration ?? ""),
    privacyUrl: String(row.privacy_url ?? ""),
    enabled: row.enabled === true,
  };
}

export async function loadTrackingCatalog(): Promise<{ tools: TrackingTool[]; settings: TrackingSettings }> {
  try {
    const db = getSupabaseAdmin() as unknown as SupabaseClient;
    const [{ data: tools }, { data: settings }] = await Promise.all([
      db.from("tracking_tools").select("slug, name, company, category, purpose, collects, storage, duration, privacy_url, enabled").order("sort_order"),
      db.from("tracking_settings").select("consent_version, lifetime_days, dismiss_days").eq("id", 1).maybeSingle(),
    ]);
    const parsed = Array.isArray(tools) ? tools.map((row) => asTool(row as Record<string, unknown>)).filter((row): row is TrackingTool => Boolean(row?.slug)) : [];
    if (!parsed.length || !settings) return { tools: FALLBACK_TRACKING_TOOLS, settings: FALLBACK_TRACKING_SETTINGS };
    return {
      tools: parsed,
      settings: {
        version: Number((settings as { consent_version?: number }).consent_version ?? 1),
        lifetimeDays: Number((settings as { lifetime_days?: number }).lifetime_days ?? 365),
        dismissDays: Number((settings as { dismiss_days?: number }).dismiss_days ?? 30),
      },
    };
  } catch {
    return { tools: FALLBACK_TRACKING_TOOLS, settings: FALLBACK_TRACKING_SETTINGS };
  }
}

export function toolEnabled(tools: TrackingTool[], slug: string): boolean {
  return tools.some((tool) => tool.slug === slug && tool.enabled);
}
