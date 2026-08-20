"use server";

import { revalidatePath } from "next/cache";

import type { SettingsSaveResult } from "@/app/app/settings/types";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { completeLocationSelection, disconnectGhl } from "@/lib/ghl/connect";
import { retryDeadEvent, processGhlWebhookQueue } from "@/lib/ghl/process";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function forbidden(): SettingsSaveResult {
  return { status: "error", error: "You do not have permission to change CRM settings." };
}

async function requireManager() {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) return null;
  return ctx;
}

export async function disconnectCrm(
  _prev: SettingsSaveResult,
  _formData: FormData
): Promise<SettingsSaveResult> {
  void _prev;
  void _formData;
  const ctx = await requireManager();
  if (!ctx) return forbidden();
  await disconnectGhl(getSupabaseAdmin(), ctx.org.id);
  revalidatePath("/app/settings/integrations");
  return { status: "saved" };
}

export async function selectGhlLocation(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  const ctx = await requireManager();
  if (!ctx) return forbidden();
  const locationId = String(formData.get("location_id") ?? "").trim();
  if (!locationId) return { status: "error", error: "Choose a location to link." };
  const result = await completeLocationSelection(getSupabaseAdmin(), {
    orgId: ctx.org.id,
    memberId: ctx.member.id,
    locationId,
  });
  if (!result.ok) return { status: "error", error: result.error };
  revalidatePath("/app/settings/integrations");
  return { status: "saved" };
}

export async function retryWebhookEvent(eventId: string): Promise<SettingsSaveResult> {
  const ctx = await requireManager();
  if (!ctx) return forbidden();
  const ok = await retryDeadEvent(getSupabaseAdmin(), ctx.org.id, eventId);
  if (!ok) return { status: "error", error: "That event could not be queued for retry." };
  await processGhlWebhookQueue(getSupabaseAdmin(), 5);
  revalidatePath("/app/settings/integrations");
  return { status: "saved" };
}

export type FieldMapPayload = {
  ghlFieldId: string;
  ghlFieldKey: string;
  answerKey: string;
};

export async function saveGhlFieldMaps(maps: FieldMapPayload[]): Promise<SettingsSaveResult> {
  const ctx = await requireManager();
  if (!ctx) return forbidden();

  const cleaned = maps
    .map((map) => ({
      ghlFieldId: map.ghlFieldId.trim() || null,
      ghlFieldKey: map.ghlFieldKey.trim() || null,
      answerKey: map.answerKey.trim(),
    }))
    .filter((map) => map.answerKey && (map.ghlFieldId || map.ghlFieldKey));

  const supabase = await createClient();
  const { error: delError } = await supabase.from("ghl_field_maps").delete().eq("org_id", ctx.org.id);
  if (delError) return { status: "error", error: "Could not update field mapping." };

  if (cleaned.length > 0) {
    const { error } = await supabase.from("ghl_field_maps").insert(
      cleaned.map((map) => ({
        org_id: ctx.org.id,
        ghl_field_id: map.ghlFieldId,
        ghl_field_key: map.ghlFieldKey,
        answer_key: map.answerKey,
      }))
    );
    if (error) return { status: "error", error: "Could not save field mapping." };
  }

  revalidatePath("/app/settings/integrations");
  revalidatePath("/app/settings/scoring");
  return { status: "saved" };
}
