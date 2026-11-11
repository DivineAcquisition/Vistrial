/**
 * The accounts a workspace can connect besides Meta: what each one is, how it signs in, which settings the
 * deployment needs before it can be offered, and how far it is built. Every connection is read-only.
 * The steps an owner takes for each provider are in docs/rebuild/integrations-setup.md.
 *
 * Endpoints and scope names are the providers' documented ones; the guide links the page each was read on.
 */

import type { SignatureScheme } from "./signatures";

export const PROVIDER_KEYS = [
  "google_ads",
  "google_analytics",
  "search_console",
  "business_profile",
  "google_calendar",
  "calendly",
  "fathom",
  "fireflies",
] as const;
export type ProviderKey = (typeof PROVIDER_KEYS)[number];

export function isProviderKey(value: string): value is ProviderKey {
  return (PROVIDER_KEYS as readonly string[]).includes(value);
}

export const GROUPS = {
  google: { title: "Google", words: "Your ads, site traffic, search results and business listing." },
  calendar: { title: "Calendar", words: "Booked calls, and who cancelled or did not show where the calendar records it." },
  notes: { title: "AI note takers", words: "Call transcripts and summaries from the tool that records your calls." },
} as const;
export type GroupKey = keyof typeof GROUPS;

/** One OAuth app can serve several providers: all four Google products and Google Calendar share one client. */
export const OAUTH_APPS = {
  google: {
    idEnv: "GOOGLE_OAUTH_CLIENT_ID",
    secretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    callbackPath: "/integrations/google/callback",
    pkce: true,
    clientAuth: "body",
    scopeSeparator: " ",
    /** `offline` returns a refresh token; `consent` makes Google return one again on a reconnect. */
    extra: { access_type: "offline", prompt: "consent", include_granted_scopes: "false" } as Record<string, string>,
    /** Asked for with every Google product so the connection can show which Google account it is. */
    identityScopes: ["openid", "email"],
  },
  calendly: {
    idEnv: "CALENDLY_CLIENT_ID",
    secretEnv: "CALENDLY_CLIENT_SECRET",
    authorizeUrl: "https://auth.calendly.com/oauth/authorize",
    tokenUrl: "https://auth.calendly.com/oauth/token",
    revokeUrl: "https://auth.calendly.com/oauth/revoke",
    callbackPath: "/integrations/calendly/callback",
    /** Calendly refuses a sign-in without a PKCE challenge. */
    pkce: true,
    clientAuth: "basic",
    scopeSeparator: " ",
    extra: {} as Record<string, string>,
    identityScopes: [] as string[],
  },
} as const;
export type OAuthAppKey = keyof typeof OAUTH_APPS;

export function isOAuthAppKey(value: string): value is OAuthAppKey {
  return value in OAUTH_APPS;
}

export type Provider = {
  key: ProviderKey;
  group: GroupKey;
  name: string;
  /** What it adds, in a few words. */
  kind: string;
  /** What Vistrial reads. */
  reads: string;
  /** What Vistrial never does there. */
  never: string;
  /** The sign-in the provider uses, or null when the provider has no connect flow built yet. */
  oauth: { app: OAuthAppKey; scopes: string[] } | null;
  /** Settings the deployment needs besides the OAuth app's, by name. Never a value. */
  extraEnv: string[];
  /**
   * How the provider signs its webhooks, when it sends any. With `secretEnv` the provider issues one
   * signing secret per app, kept as a deployment setting; without it each connection has its own.
   */
  webhook: { scheme: SignatureScheme; secretEnv?: string } | null;
  /**
   * How far it is built. "connect": an Owner can sign in and disconnect. "designed": the steps are in the
   * guide and nothing connects yet, even with its settings present.
   */
  stage: "connect" | "designed";
};

export const PROVIDERS: Record<ProviderKey, Provider> = {
  google_ads: {
    key: "google_ads",
    group: "google",
    name: "Google Ads",
    kind: "Search and display ad results",
    reads: "Campaign names and status, spend, impressions, clicks and conversions.",
    never: "Create, change, pause or pay for ads. Google offers no read-only permission, so Vistrial only makes read requests.",
    oauth: { app: "google", scopes: ["https://www.googleapis.com/auth/adwords"] },
    // No developer token: Google retired them on 2026-09-09; access follows the Cloud project.
    extraEnv: [],
    webhook: null,
    stage: "designed",
  },
  google_analytics: {
    key: "google_analytics",
    group: "google",
    name: "Google Analytics 4",
    kind: "Site traffic and conversions",
    reads: "Sessions, sources, landing pages and key events, as totals.",
    never: "Change a property, its settings or its users.",
    oauth: { app: "google", scopes: ["https://www.googleapis.com/auth/analytics.readonly"] },
    extraEnv: [],
    webhook: null,
    stage: "designed",
  },
  search_console: {
    key: "search_console",
    group: "google",
    name: "Search Console",
    kind: "Search queries and pages",
    reads: "The searches and pages that brought clicks and impressions.",
    never: "Submit sitemaps, remove pages or change a property.",
    oauth: { app: "google", scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] },
    extraEnv: [],
    webhook: null,
    stage: "designed",
  },
  business_profile: {
    key: "business_profile",
    group: "google",
    name: "Google Business Profile",
    kind: "Your listing",
    reads: "Views, calls, direction requests and the searches that found the listing.",
    never: "Edit the listing, post, or reply to reviews. Google offers no read-only permission, so Vistrial only makes read requests.",
    oauth: { app: "google", scopes: ["https://www.googleapis.com/auth/business.manage"] },
    extraEnv: [],
    webhook: null,
    stage: "designed",
  },
  google_calendar: {
    key: "google_calendar",
    group: "calendar",
    name: "Google Calendar",
    kind: "Booked calls",
    reads: "How many meetings with outside guests were booked, cancelled or declined, by week. Counts only.",
    never: "Create, change or delete events, or email your guests.",
    oauth: { app: "google", scopes: ["https://www.googleapis.com/auth/calendar.events.owned.readonly"] },
    extraEnv: [],
    webhook: null,
    stage: "connect",
  },
  calendly: {
    key: "calendly",
    group: "calendar",
    name: "Calendly",
    kind: "Booked calls and no-shows",
    reads: "How many calls were booked, cancelled or marked no-show, by week and by event type. Counts only.",
    never: "Book, cancel or reschedule anything, or message your invitees.",
    oauth: { app: "calendly", scopes: ["users:read", "scheduled_events:read"] },
    extraEnv: [],
    webhook: { scheme: "calendly", secretEnv: "CALENDLY_WEBHOOK_SIGNING_KEY" },
    stage: "connect",
  },
  fathom: {
    key: "fathom",
    group: "notes",
    name: "Fathom",
    kind: "Call transcripts and summaries",
    reads: "The transcript and summary of calls you choose. No audio or video.",
    never: "Record, join or change a meeting, or share a recording.",
    oauth: null,
    extraEnv: ["FATHOM_CLIENT_ID", "FATHOM_CLIENT_SECRET"],
    webhook: { scheme: "standardWebhooks" },
    stage: "designed",
  },
  fireflies: {
    key: "fireflies",
    group: "notes",
    name: "Fireflies",
    kind: "Call transcripts and summaries",
    reads: "The transcript and summary of calls you choose. No audio or video.",
    never: "Record, join or change a meeting, or share a recording.",
    oauth: null,
    // Fireflies has no app to register: each customer would paste their own API key.
    extraEnv: [],
    webhook: { scheme: "hubSha256" },
    stage: "designed",
  },
};

export function providerList() {
  return PROVIDER_KEYS.map((key) => PROVIDERS[key]);
}

/** Every setting a provider needs on the deployment, by name. */
export function requiredEnv(provider: Provider) {
  const app = provider.oauth ? OAUTH_APPS[provider.oauth.app] : null;
  return [...(app ? [app.idEnv, app.secretEnv] : []), ...provider.extraEnv];
}

/** The settings still missing. Reads names only; a value is never returned. */
export function missingEnv(provider: Provider, env: Record<string, string | undefined> = process.env) {
  return requiredEnv(provider).filter((name) => !env[name]);
}

export type Readiness = "not_set_up" | "not_built" | "ready";

/** Whether an Owner can be offered a Connect button. */
export function readiness(provider: Provider, env: Record<string, string | undefined> = process.env): Readiness {
  if (missingEnv(provider, env).length > 0) return "not_set_up";
  return provider.stage === "connect" && provider.oauth ? "ready" : "not_built";
}

export function scopesFor(provider: Provider) {
  if (!provider.oauth) return [];
  return [...OAUTH_APPS[provider.oauth.app].identityScopes, ...provider.oauth.scopes];
}

/**
 * Where a provider sends the person back to. Normally this deployment's own site. Google only verifies an
 * app whose redirect address is on a domain the owner can prove they own, so INTEGRATIONS_CALLBACK_ORIGIN
 * can name such a domain (one that forwards these paths here). See the guide's "Redirect address" section.
 */
export function callbackUrl(app: OAuthAppKey, env: Record<string, string | undefined> = process.env) {
  const site = env.INTEGRATIONS_CALLBACK_ORIGIN || env.CONVEX_SITE_URL;
  if (!site) throw new Error("This deployment has no site URL.");
  return `${site.replace(/\/$/, "")}${OAUTH_APPS[app].callbackPath}`;
}

export function webhookUrl(provider: ProviderKey, hookId: string, site: string | undefined = process.env.CONVEX_SITE_URL) {
  if (!site) throw new Error("This deployment has no site URL.");
  return `${site.replace(/\/$/, "")}/integrations/webhook/${provider}/${hookId}`;
}
