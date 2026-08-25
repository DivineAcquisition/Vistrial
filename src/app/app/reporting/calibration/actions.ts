"use server";

import { revalidatePath } from "next/cache";

import type { SettingsSaveResult } from "@/app/app/settings/types";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

function deny(): SettingsSaveResult {
  return { status: "error", error: "You do not have permission to change scoring settings." };
}

export async function applyCalibrationSuggestion(suggestionId: string): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) return deny();
  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_calibration_suggestion", {
    p_org_id: ctx.org.id,
    p_suggestion_id: suggestionId,
  });
  if (error) return { status: "error", error: error.message };
  revalidatePath("/app/reporting/calibration");
  revalidatePath("/app/settings/scoring");
  return { status: "saved" };
}

export async function dismissCalibrationSuggestion(suggestionId: string): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) return deny();
  const supabase = await createClient();
  const { error } = await supabase.rpc("dismiss_calibration_suggestion", {
    p_org_id: ctx.org.id,
    p_suggestion_id: suggestionId,
  });
  if (error) return { status: "error", error: error.message };
  revalidatePath("/app/reporting/calibration");
  return { status: "saved" };
}
