"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { SettingsSaveResult } from "@/app/(workspace)/app/settings/types";
import { getAuthContext } from "@/lib/auth/session";
import { ONBOARDING_STATES, ONBOARDING_STEP_KEYS } from "@/lib/portal/onboarding";
import { createClient } from "@/lib/supabase/server";

/** The team can override one step, or clear the override so it follows the workspace again. */
export async function setOnboardingStep(_prev: SettingsSaveResult, formData: FormData): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!ctx.isStaff) return { status: "error", error: "Only your Vistrial team can change a step." };
  const key = String(formData.get("key") ?? "");
  if (!(ONBOARDING_STEP_KEYS as readonly string[]).includes(key)) return { status: "error", error: "Choose a step." };
  const state = String(formData.get("state") ?? "");
  if (state && !(state in ONBOARDING_STATES)) return { status: "error", error: "Choose a state." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  const eta = String(formData.get("eta") ?? "").trim().slice(0, 80);

  const db = (await createClient()) as unknown as SupabaseClient;
  const { error } = await db.rpc("onboarding_status_set_step", {
    p_org_id: ctx.org.id,
    p_key: key,
    p_state: state || null,
    p_note: note || null,
    p_eta: eta || null,
  });
  if (error) return { status: "error", error: "Could not update that step." };
  revalidatePath("/app/onboarding/progress");
  revalidatePath("/app/home");
  return { status: "saved" };
}
