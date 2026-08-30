import "server-only";

import { appUrl } from "@/lib/app-url";
import { GHL_API_BASE, GHL_OAUTH_AUTHORIZE_DEFAULT } from "@/lib/ghl/constants";

export { appUrl };

export function ghlClientId(): string {
  return process.env.GHL_CLIENT_ID?.trim() ?? "";
}

export function ghlClientSecret(): string {
  return process.env.GHL_CLIENT_SECRET?.trim() ?? "";
}

export function ghlOAuthConfigured(): boolean {
  return Boolean(ghlClientId() && ghlClientSecret());
}

/** Marketplace OAuth redirect. Do not put a CRM brand acronym in this path. */
export function ghlOAuthRedirectUri(): string {
  return `${appUrl()}/api/leadconnector/oauth/callback`;
}

export function ghlOAuthAuthorizeUrl(): string {
  return process.env.GHL_OAUTH_AUTHORIZE_URL?.trim() || GHL_OAUTH_AUTHORIZE_DEFAULT;
}

export function ghlApiBase(): string {
  return process.env.GHL_API_BASE?.trim() || GHL_API_BASE;
}

/** Marketplace default webhook URL. Do not put a CRM brand acronym in this path. */
export function ghlWebhookUrl(): string {
  return `${appUrl()}/api/leadconnector/webhooks`;
}

export function ingestionAlertWebhookUrl(): string {
  return process.env.INGESTION_ALERT_WEBHOOK_URL?.trim() ?? "";
}
