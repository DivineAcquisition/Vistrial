"use server";

import type { SettingsSaveResult } from "@/app/app/settings/types";
import { getAuthContext } from "@/lib/auth/session";
import { logSettingsActivity } from "@/lib/settings/activity";
import { isOwner } from "@/lib/settings/managed";
import { canWriteAdvancedSettings } from "@/lib/settings/managed";
import { loadOrgManaged } from "@/lib/settings/org";
import { revalidateSettings } from "@/lib/settings/revalidate";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function deny(): SettingsSaveResult {
  return { status: "error", error: "You do not have permission to change that." };
}

export async function updateAggregateOptOut(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!isOwner(ctx)) return deny();
  const managed = await loadOrgManaged(ctx.org.id);
  if (!canWriteAdvancedSettings(ctx, managed.managed)) {
    return {
      status: "error",
      error: "These settings are managed by your install team. Take over management, or ask them to make the change.",
    };
  }
  const optOut = formData.get("aggregate_opt_out") === "on";
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("business_profiles")
    .update({
      aggregate_opt_out: optOut,
      aggregate_opt_out_at: optOut ? new Date().toISOString() : null,
    } as never)
    .eq("org_id", ctx.org.id);
  if (error) return { status: "error", error: "Could not save the aggregate preference." };
  await logSettingsActivity({
    ctx,
    section: "data",
    action: optOut ? "Opted out of cross-client aggregates" : "Opted back into cross-client aggregates",
    to: { optOut },
  });
  revalidateSettings();
  return { status: "saved" };
}

export async function deleteWorkspace(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!isOwner(ctx)) return deny();
  const name = String(formData.get("confirmation_name") ?? "").trim();
  if (!name) return { status: "error", error: "Type the workspace name to confirm deletion." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("owner_delete_org", {
    p_org_id: ctx.org.id,
    p_confirmation_name: name,
  });
  if (error) {
    if (error.message.includes("confirmation_mismatch") || error.message.toLowerCase().includes("match")) {
      return { status: "error", error: "The name did not match. Deletion refused." };
    }
    return { status: "error", error: "Could not delete the workspace." };
  }
  return { status: "saved" };
}
