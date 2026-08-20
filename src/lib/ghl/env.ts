import { GHL_API_BASE, GHL_OAUTH_AUTHORIZE_DEFAULT } from "@/lib/ghl/constants";

export function ghlClientId(): string {
  return process.env.GHL_CLIENT_ID?.trim() ?? "";
}

export function ghlClientSecret(): string {
  return process.env.GHL_CLIENT_SECRET?.trim() ?? "";
}

export function ghlOAuthConfigured(): boolean {
  return Boolean(ghlClientId() && ghlClientSecret());
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
}

export function ghlOAuthRedirectUri(): string {
  return `${appUrl()}/api/ghl/oauth/callback`;
}

export function ghlOAuthAuthorizeUrl(): string {
  return process.env.GHL_OAUTH_AUTHORIZE_URL?.trim() || GHL_OAUTH_AUTHORIZE_DEFAULT;
}

export function ghlApiBase(): string {
  return process.env.GHL_API_BASE?.trim() || GHL_API_BASE;
}

export function ghlWebhookUrl(): string {
  return `${appUrl()}/api/ghl/webhooks`;
}

export function ingestionAlertWebhookUrl(): string {
  return process.env.INGESTION_ALERT_WEBHOOK_URL?.trim() ?? "";
}
