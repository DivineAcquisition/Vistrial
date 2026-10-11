"use server";

import { redirect } from "next/navigation";

import { safeInternalPath } from "@/lib/auth/paths";
import { getSessionUser } from "@/lib/auth/session";
import { hashRecoveryCode, newRecoveryCodes } from "@/lib/staff/recovery";
import { staffDb } from "@/lib/staff/db";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SecurityResult = { ok: true; codes?: string[] } | { ok: false; error: string };

async function staffUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const db = await staffDb();
  const { data } = await db.rpc("staff_mfa_status");
  const self = ((data ?? []) as Array<{ user_id: string; enrolled: boolean }>).find((row) => row.user_id === user.id);
  if (!self) return { user, enrolled: false, staff: false };
  return { user, enrolled: self.enrolled, staff: true };
}

/** Shown once. Replaces any unused codes for this person. */
export async function issueRecoveryCodes(): Promise<SecurityResult> {
  const who = await staffUser();
  if (!who.staff) return { ok: false, error: "Only the Vistrial team sets these up." };
  if (!who.enrolled) return { ok: false, error: "Verify the authenticator app first." };
  const codes = newRecoveryCodes();
  const admin = getSupabaseAdmin() as unknown as import("@supabase/supabase-js").SupabaseClient;
  await admin.from("staff_recovery_codes").delete().eq("user_id", who.user.id).is("used_at", null);
  const { error } = await admin.from("staff_recovery_codes").insert(
    codes.map((code) => ({ user_id: who.user.id, code_hash: code.hash }))
  );
  if (error) return { ok: false, error: "Could not store the recovery codes. Try again." };
  return { ok: true, codes: codes.map((code) => code.plain) };
}

/** A recovery code stands in for the authenticator app for 15 minutes. */
export async function redeemRecoveryCode(code: string, nextPath: string): Promise<SecurityResult> {
  const who = await staffUser();
  if (!who.staff) return { ok: false, error: "Only the Vistrial team can use a recovery code." };
  const admin = getSupabaseAdmin() as unknown as import("@supabase/supabase-js").SupabaseClient;
  const { data } = await admin
    .from("staff_recovery_codes")
    .select("id")
    .eq("user_id", who.user.id)
    .eq("code_hash", hashRecoveryCode(code))
    .is("used_at", null)
    .maybeSingle();
  if (!data) return { ok: false, error: "That recovery code is not valid." };
  const until = new Date(Date.now() + 15 * 60_000).toISOString();
  const { error } = await admin.from("staff_recovery_codes").update({ used_at: new Date().toISOString() }).eq("id", data.id);
  if (error) return { ok: false, error: "Could not use that code. Try again." };
  await admin.from("staff_mfa_grants").upsert({ user_id: who.user.id, until });
  redirect(safeInternalPath(nextPath, "/app/team"));
}

export async function reenterPassword(password: string, nextPath: string): Promise<SecurityResult> {
  const who = await staffUser();
  if (!who.staff) return { ok: false, error: "Only the Vistrial team uses this check." };
  if (who.enrolled) return { ok: false, error: "Use the authenticator app." };
  const email = who.user.email;
  if (!email || !password) return { ok: false, error: "Enter your password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: "That password did not match." };
  redirect(safeInternalPath(nextPath, "/app/team"));
}
