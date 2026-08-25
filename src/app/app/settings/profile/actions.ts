"use server";

import { revalidatePath } from "next/cache";

import type { SettingsSaveResult } from "@/app/app/settings/types";
import { normalizeInviteEmail } from "@/lib/auth/invites";
import { getAuthContext } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseIanaTimeZone } from "@/lib/timezones";

export async function updateProfile(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();

  const displayName = String(formData.get("display_name") ?? "").trim();
  const email = normalizeInviteEmail(String(formData.get("email") ?? ""));
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const timezoneRaw = String(formData.get("timezone") ?? "").trim();
  const startRaw = String(formData.get("working_hours_start") ?? "").trim();
  const endRaw = String(formData.get("working_hours_end") ?? "").trim();
  const days = formData.getAll("working_days").map((value) => Number(value)).filter((day) => day >= 1 && day <= 7);

  if (!displayName) {
    return { status: "error", error: "Display name is required." };
  }
  if (displayName.length > 80) {
    return { status: "error", error: "Display name is too long." };
  }
  if (!email.includes("@")) {
    return { status: "error", error: "Enter a valid email." };
  }
  const timezone = timezoneRaw ? parseIanaTimeZone(timezoneRaw) : null;
  if (timezoneRaw && !timezone) {
    return { status: "error", error: "Choose a supported timezone." };
  }

  const { error } = await getSupabaseAdmin()
    .from("org_members")
    .update({
      display_name: displayName,
      email,
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
    return { status: "error", error: "Could not save your profile." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/app/settings/profile");
  return { status: "saved" };
}
