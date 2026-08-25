"use server";

import type { SettingsSaveResult } from "@/app/app/settings/types";
import { getAuthContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/settings/managed";
import { revalidateSettings } from "@/lib/settings/revalidate";
import { createClient } from "@/lib/supabase/server";

export async function takeOverManagement(
  _prev: SettingsSaveResult,
  _formData: FormData
): Promise<SettingsSaveResult> {
  void _formData;
  const ctx = await getAuthContext();
  if (!isOwner(ctx)) {
    return { status: "error", error: "Only an owner can take over management." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("take_over_org_management", { p_org_id: ctx.org.id });
  if (error) return { status: "error", error: "Could not take over management." };
  revalidateSettings();
  return { status: "saved" };
}
