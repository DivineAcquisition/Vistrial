"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { SettingsSaveResult } from "@/app/(workspace)/app/settings/types";
import { normalizeInviteEmail } from "@/lib/auth/invites";
import { getAuthContext } from "@/lib/auth/session";
import { removeAvatar, storeAvatar } from "@/lib/portal/avatars";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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

export async function updatePhoto(_prev: SettingsSaveResult, formData: FormData): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  const db = (await createClient()) as unknown as SupabaseClient;
  if (formData.get("remove") === "1") {
    const { error } = await db.rpc("portal_update_self", { p_org_id: ctx.org.id, p_clear_avatar: true });
    if (error) return { status: "error", error: "Could not remove your photo." };
    await removeAvatar(ctx.org.id, ctx.member.id);
  } else {
    const file = formData.get("photo");
    if (!(file instanceof File) || file.size === 0) return { status: "error", error: "Choose a photo first." };
    const stored = await storeAvatar(ctx.org.id, ctx.member.id, file);
    if ("error" in stored) return { status: "error", error: stored.error };
    const { error } = await db.rpc("portal_update_self", { p_org_id: ctx.org.id, p_avatar_path: stored.path });
    if (error) return { status: "error", error: "Could not save that photo." };
  }
  revalidatePath("/", "layout");
  return { status: "saved" };
}

export async function updateDelivery(_prev: SettingsSaveResult, formData: FormData): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  const delivery = String(formData.get("delivery") ?? "");
  if (delivery !== "instant" && delivery !== "digest") return { status: "error", error: "Choose how you hear from us." };
  const db = (await createClient()) as unknown as SupabaseClient;
  const { error } = await db.rpc("portal_update_self", { p_org_id: ctx.org.id, p_notification_delivery: delivery });
  if (error) return { status: "error", error: "Could not save that." };
  revalidatePath("/app/settings/profile");
  return { status: "saved" };
}

const MIN_PASSWORD = 10;

export async function changePassword(_prev: SettingsSaveResult, formData: FormData): Promise<SettingsSaveResult> {
  await getAuthContext();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < MIN_PASSWORD) return { status: "error", error: `Use at least ${MIN_PASSWORD} characters.` };
  if (password.length > 200) return { status: "error", error: "That password is too long." };
  if (password !== confirm) return { status: "error", error: "The two passwords do not match." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (/reauth|recent/i.test(error.message)) {
      return { status: "error", error: "For your safety, sign out and back in, then change your password." };
    }
    if (/same/i.test(error.message)) return { status: "error", error: "Choose a password you have not used here." };
    return { status: "error", error: error.message || "Could not change your password." };
  }
  return { status: "saved" };
}

export async function signOutOtherDevices(_prev: SettingsSaveResult): Promise<SettingsSaveResult> {
  await getAuthContext();
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) return { status: "error", error: "Could not sign out your other devices." };
  return { status: "saved" };
}
