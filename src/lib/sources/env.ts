import { appUrl } from "@/lib/app-url";

export function sourceOAuthRedirectUri(): string {
  return `${appUrl()}/api/sources/oauth/callback`;
}

export function metaAdsConfigured(env = process.env): boolean {
  return Boolean(env.META_ADS_CLIENT_ID?.trim() && env.META_ADS_CLIENT_SECRET?.trim());
}

export function metaAdsClientId(env = process.env): string {
  return env.META_ADS_CLIENT_ID?.trim() ?? "";
}

export function metaAdsClientSecret(env = process.env): string {
  return env.META_ADS_CLIENT_SECRET?.trim() ?? "";
}

export function googleAdsConfigured(env = process.env): boolean {
  return Boolean(
    env.GOOGLE_ADS_CLIENT_ID?.trim() &&
      env.GOOGLE_ADS_CLIENT_SECRET?.trim() &&
      env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim()
  );
}

export function googleAdsClientId(env = process.env): string {
  return env.GOOGLE_ADS_CLIENT_ID?.trim() ?? "";
}

export function googleAdsClientSecret(env = process.env): string {
  return env.GOOGLE_ADS_CLIENT_SECRET?.trim() ?? "";
}

export function googleAdsDeveloperToken(env = process.env): string {
  return env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() ?? "";
}

/** Read-only. The write-capable `adwords` scope is never requested. */
export const GOOGLE_ADS_READONLY_SCOPE = "https://www.googleapis.com/auth/adwords.readonly";

export function stripeConnectConfigured(env = process.env): boolean {
  return Boolean(env.STRIPE_CLIENT_ID?.trim() && env.STRIPE_CLIENT_SECRET?.trim());
}

export function stripeClientId(env = process.env): string {
  return env.STRIPE_CLIENT_ID?.trim() ?? "";
}

export function stripeClientSecret(env = process.env): string {
  return env.STRIPE_CLIENT_SECRET?.trim() ?? "";
}

export function stripeWebhookSecret(env = process.env): string {
  return env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
}

export function googleCalendarConfigured(env = process.env): boolean {
  return Boolean(env.GOOGLE_CALENDAR_CLIENT_ID?.trim() && env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim());
}

export function googleCalendarClientId(env = process.env): string {
  return env.GOOGLE_CALENDAR_CLIENT_ID?.trim() ?? "";
}

export function googleCalendarClientSecret(env = process.env): string {
  return env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() ?? "";
}

export const GOOGLE_CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export function commasApiBase(env = process.env): string {
  return env.COMMAS_API_BASE?.trim() || "https://api.commas.com";
}

export function formWebhookUrl(publicToken: string): string {
  return `${appUrl()}/api/sources/webhooks/forms/${publicToken}`;
}

export function sourceOAuthCookieName(kind: string): string {
  return `vistrial_source_oauth_${kind}`;
}
