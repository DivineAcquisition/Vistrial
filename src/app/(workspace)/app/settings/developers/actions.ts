"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAuthContext } from "@/lib/auth/session";
import { API_LIMITS, isApiScope } from "@/lib/api/v1/limits";
import { hashSecret } from "@/lib/api/v1/gateway";
import { assertPublicHttps } from "@/lib/security/outbound-url";
import { newWebhookSecret, sealWebhookSecret } from "@/lib/webhooks/deliver";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function createApiKey(formData: FormData) {
  const ctx = await getAuthContext();
  if (ctx.workspaceRole !== "owner") return;
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data: access } = await db.rpc("billing_feature", { p_org_id: ctx.org.id, p_key: "api_access" });
  if (access !== true) return;
  const { count } = await db.from("api_keys").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).is("revoked_at", null);
  if ((count ?? 0) >= API_LIMITS.keys) return;
  const scopes = formData.getAll("scopes").map(String).filter(isApiScope);
  const secret = `vstr_${formData.get("test") === "on" ? "test" : "live"}_${randomBytes(24).toString("base64url")}`;
  const name = String(formData.get("name") ?? "Key").slice(0, 80);
  const { error } = await db.from("api_keys").insert({
    org_id: ctx.org.id,
    name,
    prefix: secret.slice(0, 16),
    secret_hash: hashSecret(secret),
    mode: formData.get("test") === "on" ? "test" : "live",
    scopes,
    created_by: ctx.user.id,
  });
  if (error) return;
  const admin = getSupabaseAdmin();
  await enqueueNotification(admin, {
    orgId: ctx.org.id,
    eventType: "api_key_notice",
    channel: "email",
    recipientUserId: ctx.user.id,
    recipientMemberId: null,
    subjectIds: [],
    title: "An API key was created",
    body: `${name} can be used until you revoke it. The secret was shown once and is not in this email.`,
    href: "/app/settings/developers",
    dedupeKey: `api-key-created:${ctx.org.id}:${secret.slice(0, 12)}`,
  });
  const jar = await cookies();
  jar.set("vistrial_key_once", secret, { httpOnly: true, secure: true, maxAge: 120, path: "/app/settings/developers", sameSite: "lax" });
  redirect("/app/settings/developers?created=key");
}

export async function revokeApiKey(formData: FormData) {
  const ctx = await getAuthContext();
  const staff = ctx.workspaceRole === "service_team" || ctx.workspaceRole === "platform_admin";
  if (ctx.workspaceRole !== "owner" && !staff) return;
  const db = (await createClient()) as unknown as SupabaseClient;
  await db.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", String(formData.get("id"))).eq("org_id", ctx.org.id);
  redirect("/app/settings/developers");
}

export async function saveWebhook(formData: FormData) {
  const ctx = await getAuthContext();
  if (ctx.workspaceRole !== "owner") return;
  const url = String(formData.get("url") ?? "");
  try {
    await assertPublicHttps(url);
  } catch {
    return;
  }
  const db = (await createClient()) as unknown as SupabaseClient;
  const { count } = await db.from("webhook_endpoints").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id);
  if ((count ?? 0) >= API_LIMITS.webhookEndpoints) return;
  const secret = newWebhookSecret();
  const events = String(formData.get("events") ?? "")
    .split(",")
    .map((event) => event.trim())
    .filter(Boolean)
    .slice(0, 30);
  const { error } = await db.from("webhook_endpoints").insert({
    org_id: ctx.org.id,
    name: String(formData.get("name") ?? "Webhook").slice(0, 80),
    url,
    events,
    secret_encrypted: sealWebhookSecret(secret),
    include_data: formData.get("include_data") === "on",
    created_by: ctx.user.id,
  });
  if (error) return;
  const jar = await cookies();
  jar.set("vistrial_signing_once", secret, { httpOnly: true, secure: true, maxAge: 120, path: "/app/settings/developers", sameSite: "lax" });
  redirect("/app/settings/developers?created=signing");
}
