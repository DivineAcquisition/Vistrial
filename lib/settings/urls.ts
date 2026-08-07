/**
 * Configurable base URLs and mail identity.
 *
 * Stored in app_settings so they can change without a deploy. Link construction
 * must use these — never hardcode a host and never infer from the request.
 *
 * Uses supabase-js directly (not createServiceClient) so notification helpers
 * remain importable in unit tests that do not run under Next's server graph.
 */

import { createClient } from "@supabase/supabase-js";

export const STAFF_BASE_URL_KEY = "staff_base_url";
export const CLIENT_BASE_URL_KEY = "client_base_url";
export const WEBHOOK_BASE_URL_KEY = "webhook_base_url";
export const EMAIL_FROM_KEY = "email_from";
export const EMAIL_REPLY_TO_KEY = "email_reply_to";

export const DEFAULT_STAFF_BASE_URL = "https://admin.vistrial.io";
export const DEFAULT_CLIENT_BASE_URL = "https://app.vistrial.io";
/** Public Edge Function URL on the Vistrial Supabase project. */
export const DEFAULT_WEBHOOK_BASE_URL =
  "https://vsbzcbiyvaihhejjsypn.supabase.co/functions/v1/inbound";
export const DEFAULT_EMAIL_FROM = "Vistrial <noreply@mail.vistrial.io>";
export const DEFAULT_EMAIL_REPLY_TO = "ops@divineacquisition.io";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function settingsClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function readSetting(key: string): Promise<string | null> {
  try {
    const db = settingsClient();
    if (!db) return null;
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (typeof data?.value === "string" && data.value.trim() !== "") {
      return data.value.trim();
    }
  } catch {
    // Settings unavailable (missing env / migrations). Callers use defaults.
  }
  return null;
}

export async function staffBaseUrl(): Promise<string> {
  const value = await readSetting(STAFF_BASE_URL_KEY);
  return stripTrailingSlash(value ?? DEFAULT_STAFF_BASE_URL);
}

export async function clientBaseUrl(): Promise<string> {
  const value = await readSetting(CLIENT_BASE_URL_KEY);
  return stripTrailingSlash(value ?? DEFAULT_CLIENT_BASE_URL);
}

export async function webhookBaseUrl(): Promise<string> {
  const value = await readSetting(WEBHOOK_BASE_URL_KEY);
  return stripTrailingSlash(value ?? DEFAULT_WEBHOOK_BASE_URL);
}

export async function emailFromAddress(): Promise<string | null> {
  const value = await readSetting(EMAIL_FROM_KEY);
  if (value) return value;
  // GAP: env fallback until settings are saved in each environment.
  return process.env.NOTIFICATION_FROM?.trim() || DEFAULT_EMAIL_FROM;
}

export async function emailReplyToAddress(): Promise<string | null> {
  const value = await readSetting(EMAIL_REPLY_TO_KEY);
  if (value) return value;
  return process.env.ADMIN_NOTIFY_EMAIL?.trim() || DEFAULT_EMAIL_REPLY_TO;
}

export type DomainSettings = {
  staffBaseUrl: string;
  clientBaseUrl: string;
  webhookBaseUrl: string;
  emailFrom: string;
  emailReplyTo: string;
};

export async function loadDomainSettings(): Promise<DomainSettings> {
  const [staff, client, webhook, from, replyTo] = await Promise.all([
    staffBaseUrl(),
    clientBaseUrl(),
    webhookBaseUrl(),
    emailFromAddress(),
    emailReplyToAddress(),
  ]);

  return {
    staffBaseUrl: staff,
    clientBaseUrl: client,
    webhookBaseUrl: webhook,
    emailFrom: from ?? DEFAULT_EMAIL_FROM,
    emailReplyTo: replyTo ?? DEFAULT_EMAIL_REPLY_TO,
  };
}
