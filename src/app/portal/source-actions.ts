"use server";

import { revalidatePath } from "next/cache";

import { loadConnection } from "@/lib/ghl/tokens";
import { assertPortalAccess } from "@/lib/portal/access";
import { nextSendAtFor } from "@/lib/portal/load";
import { disconnectSource, newPublicToken, upsertSourceConnection } from "@/lib/sources/connections";
import { testSourceConnection } from "@/lib/sources/sync";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SourceKind } from "@/types/database";
import type { SettingsSaveResult } from "@/app/app/settings/types";

function denied(): SettingsSaveResult {
  return { status: "error", error: "The owner portal is owner and admin only." };
}

const KINDS: SourceKind[] = [
  "meta_ads",
  "google_ads",
  "stripe",
  "commas",
  "calendar",
  "form_platform",
];

function asKind(value: string): SourceKind | null {
  return (KINDS as string[]).includes(value) ? (value as SourceKind) : null;
}

export async function savePortalSchedule(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  void _prev;
  const access = await assertPortalAccess();
  if (!access.ok) return denied();
  const cadenceRaw = String(formData.get("cadence") ?? "monthly");
  const cadence = cadenceRaw === "weekly" ? "weekly" : "monthly";
  const enabled = String(formData.get("enabled") ?? "") === "1";
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("portal_schedules").upsert(
    {
      org_id: access.ctx.org.id,
      cadence,
      enabled,
      next_send_at: nextSendAtFor(cadence),
      last_error: null,
    },
    { onConflict: "org_id" }
  );
  if (error) return { status: "error", error: error.message };
  revalidatePath("/portal");
  return { status: "saved" };
}

export async function testConnectedSource(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  void _prev;
  const access = await assertPortalAccess();
  if (!access.ok) return denied();
  const kind = asKind(String(formData.get("kind") ?? ""));
  if (!kind) return { status: "error", error: "Unknown source." };
  const result = await testSourceConnection(getSupabaseAdmin(), access.ctx.org.id, kind);
  revalidatePath("/portal");
  revalidatePath("/app/settings/integrations");
  return result.ok ? { status: "saved" } : { status: "error", error: result.error };
}

export async function disconnectConnectedSource(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  void _prev;
  const access = await assertPortalAccess();
  if (!access.ok) return denied();
  const kind = asKind(String(formData.get("kind") ?? ""));
  if (!kind) return { status: "error", error: "Unknown source." };
  await disconnectSource(getSupabaseAdmin(), access.ctx.org.id, kind);
  revalidatePath("/portal");
  revalidatePath("/app/settings/integrations");
  return { status: "saved" };
}

export async function connectCommasKey(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  void _prev;
  const access = await assertPortalAccess();
  if (!access.ok) return denied();
  const key = String(formData.get("api_key") ?? "").trim();
  if (!key) return { status: "error", error: "Paste a Commas API key." };
  await upsertSourceConnection(getSupabaseAdmin(), {
    orgId: access.ctx.org.id,
    kind: "commas",
    provider: "commas",
    secret: key,
    publicToken: newPublicToken(),
    verified: true,
  });
  const tested = await testSourceConnection(getSupabaseAdmin(), access.ctx.org.id, "commas");
  revalidatePath("/portal");
  revalidatePath("/app/settings/integrations");
  return tested.ok ? { status: "saved" } : { status: "error", error: tested.error };
}

export async function connectFormPlatform(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  void _prev;
  const access = await assertPortalAccess();
  if (!access.ok) return denied();
  const secret = String(formData.get("webhook_secret") ?? "").trim() || newPublicToken();
  await upsertSourceConnection(getSupabaseAdmin(), {
    orgId: access.ctx.org.id,
    kind: "form_platform",
    provider: "forms",
    secret,
    publicToken: newPublicToken(),
    verified: true,
  });
  revalidatePath("/portal");
  revalidatePath("/app/settings/integrations");
  return { status: "saved" };
}

export async function connectCalendarViaGhl(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  void _prev;
  void formData;
  const access = await assertPortalAccess();
  if (!access.ok) return denied();
  const db = getSupabaseAdmin();
  const ghl = await loadConnection(db, access.ctx.org.id);
  if (!ghl || ghl.status !== "active" || !ghl.location_id) {
    return { status: "error", error: "Connect LeadConnector first. Calendar metadata is read from that connection." };
  }
  await upsertSourceConnection(db, {
    orgId: access.ctx.org.id,
    kind: "calendar",
    provider: "ghl",
    accountLabel: ghl.location_name ?? ghl.location_id,
    metadata: { location_id: ghl.location_id },
    verified: true,
  });
  revalidatePath("/portal");
  revalidatePath("/app/settings/integrations");
  return { status: "saved" };
}
