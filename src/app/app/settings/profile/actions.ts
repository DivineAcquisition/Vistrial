"use server";

import { revalidatePath } from "next/cache";

import type { SettingsSaveResult } from "@/app/app/settings/types";
import { normalizeInviteEmail } from "@/lib/auth/invites";
import { getAuthContext } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseIanaTimeZone } from "@/lib/timezones";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();

  const displayName = String(formData.get("display_name") ?? "").trim();
  const email = normalizeInviteEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("password_confirm") ?? "");

  if (!displayName) {
    return { status: "error", error: "Display name is required." };
  }
  if (displayName.length > 80) {
    return { status: "error", error: "Display name is too long." };
  }
  if (!email.includes("@")) {
    return { status: "error", error: "Enter a valid email." };
  }
  if (password || passwordConfirm) {
    if (password.length < 8) {
      return { status: "error", error: "Password must be at least 8 characters." };
    }
    if (password !== passwordConfirm) {
      return { status: "error", error: "The password confirmation does not match." };
    }
  }

  const { error } = await getSupabaseAdmin()
    .from("org_members")
    .update({
      display_name: displayName,
      email,
    })
    .eq("id", ctx.member.id)
    .eq("org_id", ctx.org.id)
    .eq("user_id", ctx.user.id);

  if (error) {
    return { status: "error", error: "Could not save your profile." };
  }

  if (password) {
    const supabase = await createClient();
    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) {
      return { status: "error", error: "Name and email saved. The password could not be updated." };
    }
  }

  revalidatePath("/", "layout");
  revalidatePath("/app/settings/profile");
  return { status: "saved" };
}

export async function updateWorkingHours(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const timezoneRaw = String(formData.get("timezone") ?? "").trim();
  const startRaw = String(formData.get("working_hours_start") ?? "").trim();
  const endRaw = String(formData.get("working_hours_end") ?? "").trim();
  const days = formData.getAll("working_days").map((value) => Number(value)).filter((day) => day >= 1 && day <= 7);
  const timezone = timezoneRaw ? parseIanaTimeZone(timezoneRaw) : null;
  if (timezoneRaw && !timezone) {
    return { status: "error", error: "Choose a supported timezone." };
  }

  const { error } = await getSupabaseAdmin()
    .from("org_members")
    .update({
      phone: phoneRaw || null,
      timezone,
      working_hours_start: startRaw || null,
      working_hours_end: endRaw || null,
      working_days: days.length > 0 ? days : null,
    })
    .eq("id", ctx.member.id)
    .eq("org_id", ctx.org.id)
    .eq("user_id", ctx.user.id);

  if (error) {
    return { status: "error", error: "Could not save your working hours." };
  }
  revalidatePath("/app/settings/notifications");
  return { status: "saved" };
}
