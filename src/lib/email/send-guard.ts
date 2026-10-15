import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { appUrl } from "@/lib/app-url";
import type { EmailCategory, FooterVars } from "@/lib/email/footer";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Loose = SupabaseClient;

function db(): Loose {
  return getSupabaseAdmin() as unknown as Loose;
}

export async function lifecycleSuppressed(email: string): Promise<boolean> {
  const { data } = await db()
    .from("email_lifecycle_suppressions")
    .select("email")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  return Boolean(data?.email);
}

export async function issueUnsubscribeUrl(email: string, category: "E" | "F"): Promise<string | null> {
  const token = randomUUID();
  const { error } = await db().from("email_unsubscribe_tokens").insert({
    token,
    email: email.trim().toLowerCase(),
    category,
  });
  if (error) return null;
  return `${appUrl()}/email/unsubscribe?token=${token}`;
}

export async function suppressLifecycleEmail(token: string): Promise<boolean> {
  const { data } = await db()
    .from("email_unsubscribe_tokens")
    .select("email, used_at")
    .eq("token", token)
    .maybeSingle();
  const row = data as { email?: string; used_at?: string | null } | null;
  if (!row?.email) return false;
  await db().from("email_lifecycle_suppressions").upsert(
    { email: row.email, suppressed_at: new Date().toISOString() },
    { onConflict: "email" }
  );
  if (!row.used_at) {
    await db().from("email_unsubscribe_tokens").update({ used_at: new Date().toISOString() }).eq("token", token);
  }
  return true;
}

export async function recordEmailSend(args: {
  category: EmailCategory;
  version: string;
  recipient: string;
  stream: string;
  providerId?: string;
}): Promise<boolean> {
  const { error } = await db().from("email_send_log").insert({
    category: args.category,
    footer_version: args.version,
    recipient: args.recipient.trim().toLowerCase(),
    stream: args.stream,
    provider_id: args.providerId ?? null,
  });
  return !error;
}

export async function activeStaffEmails(): Promise<string[]> {
  const { data } = await db().from("platform_staff").select("email").eq("active", true);
  return ((data ?? []) as Array<{ email: string | null }>)
    .map((row) => row.email)
    .filter((email): email is string => Boolean(email?.includes("@")));
}

export async function platformAdminEmails(): Promise<string[]> {
  const { data } = await db()
    .from("platform_staff")
    .select("email")
    .eq("active", true)
    .eq("role", "platform_admin");
  return ((data ?? []) as Array<{ email: string | null }>)
    .map((row) => row.email)
    .filter((email): email is string => Boolean(email?.includes("@")));
}

export function withPreferences(vars: FooterVars): FooterVars {
  return {
    ...vars,
    preferencesUrl: vars.preferencesUrl ?? `${appUrl()}/app/settings/notifications`,
  };
}
