"use server";

import { revalidatePath } from "next/cache";

import type { SettingsSaveResult } from "@/app/app/settings/types";
import { normalizeInviteEmail } from "@/lib/auth/invites";
import { getAuthContext } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function updateProfile(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();

  const displayName = String(formData.get("display_name") ?? "").trim();
  const email = normalizeInviteEmail(String(formData.get("email") ?? ""));

  if (!displayName) {
    return { status: "error", error: "Display name is required." };
  }
  if (displayName.length > 80) {
    return { status: "error", error: "Display name is too long." };
  }
  if (!email.includes("@")) {
    return { status: "error", error: "Enter a valid email." };
  }

  // RLS only lets owner/admin update org_members. Setters and closers still
  // need to edit their own name and email, so this write is scoped to the
  // signed-in member's row and those two columns.
  const { error } = await getSupabaseAdmin()
    .from("org_members")
    .update({ display_name: displayName, email })
    .eq("id", ctx.member.id)
    .eq("org_id", ctx.org.id)
    .eq("user_id", ctx.user.id);

  if (error) {
    return { status: "error", error: "Could not save your profile." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/app/settings/profile");
  return { status: "saved" };
}
