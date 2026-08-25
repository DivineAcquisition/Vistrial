"use server";

import { revalidatePath } from "next/cache";

import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isOrgTimezone } from "@/lib/timezones";
import type { SettingsSaveResult } from "@/app/app/settings/types";

export async function updateOrganization(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) {
    return {
      status: "error",
      error: "You do not have permission to change organization settings.",
    };
  }

  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "");
  const salesCycleDays = Number(formData.get("sales_cycle_days"));
  const baselineLookbackDays = Number(formData.get("baseline_lookback_days"));
  const workingHoursStart = String(formData.get("working_hours_start") ?? "").trim();
  const workingHoursEnd = String(formData.get("working_hours_end") ?? "").trim();
  const workingDays = formData
    .getAll("working_days")
    .map((value) => Number(value))
    .filter((day) => day >= 1 && day <= 7);

  if (!name) {
    return { status: "error", error: "Organization name is required." };
  }
  if (name.length > 120) {
    return { status: "error", error: "Organization name is too long." };
  }
  if (!isOrgTimezone(timezone)) {
    return { status: "error", error: "Choose a supported timezone." };
  }
  if (!Number.isInteger(salesCycleDays) || salesCycleDays < 14 || salesCycleDays > 365) {
    return { status: "error", error: "Sales cycle must be between 14 and 365 days." };
  }
  if (!Number.isInteger(baselineLookbackDays) || baselineLookbackDays < 30 || baselineLookbackDays > 730) {
    return { status: "error", error: "Baseline lookback must be between 30 and 730 days." };
  }
  if (!/^\d{2}:\d{2}$/.test(workingHoursStart) || !/^\d{2}:\d{2}$/.test(workingHoursEnd)) {
    return { status: "error", error: "Working hours must be a start and end time." };
  }
  if (workingDays.length === 0) {
    return { status: "error", error: "Choose at least one working day." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .update({
      name,
      timezone,
      sales_cycle_days: salesCycleDays,
      baseline_lookback_days: baselineLookbackDays,
      working_hours_start: workingHoursStart,
      working_hours_end: workingHoursEnd,
      working_days: workingDays,
    })
    .eq("id", ctx.org.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { status: "error", error: "Could not save organization settings." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/app/settings/organization");
  return { status: "saved" };
}
