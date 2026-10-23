import "server-only";

import type { TrackingSettings, TrackingTool } from "@/lib/marketing/tracking-types";

export { googleAnalyticsId, metaPixelId, GA_ID_PATTERN, META_PIXEL_PATTERN } from "@/lib/marketing/tracking-ids";
export type { TrackingCategory, TrackingSettings, TrackingTool } from "@/lib/marketing/tracking-types";

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

/** The public site no longer reads a database for this list. The fallback is the catalog. */
export async function loadTrackingCatalog(): Promise<{ tools: TrackingTool[]; settings: TrackingSettings }> {
  return { tools: FALLBACK_TRACKING_TOOLS, settings: FALLBACK_TRACKING_SETTINGS };
}

export function toolEnabled(tools: TrackingTool[], slug: string): boolean {
  return tools.some((tool) => tool.slug === slug && tool.enabled);
}
