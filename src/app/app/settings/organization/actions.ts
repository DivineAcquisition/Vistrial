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

  const surface = String(formData.get("surface") ?? "workspace");
  const patch: {
    name?: string;
    timezone?: string;
    working_hours_start?: string;
    working_hours_end?: string;
    working_days?: number[];
    sales_cycle_days?: number;
    baseline_lookback_days?: number;
    transcript_retention_days?: number;
    call_coaching_embargo_hours?: number;
    operator_agent_batch_cap?: number;
  } = {};

  if (surface !== "policy") {
    const name = String(formData.get("name") ?? "").trim();
    const timezone = String(formData.get("timezone") ?? "");
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
    if (!/^\d{2}:\d{2}$/.test(workingHoursStart) || !/^\d{2}:\d{2}$/.test(workingHoursEnd)) {
      return { status: "error", error: "Working hours must be a start and end time." };
    }
    if (workingDays.length === 0) {
      return { status: "error", error: "Choose at least one working day." };
    }
    patch.name = name;
    patch.timezone = timezone;
    patch.working_hours_start = workingHoursStart;
    patch.working_hours_end = workingHoursEnd;
    patch.working_days = workingDays;
  }

  if (surface === "policy") {
    const salesCycleDays = Number(formData.get("sales_cycle_days"));
    const baselineLookbackDays = Number(formData.get("baseline_lookback_days"));
    const transcriptRetentionDays = Number(formData.get("transcript_retention_days"));
    const embargoHours = Number(formData.get("call_coaching_embargo_hours"));
    const batchCap = Number(formData.get("operator_agent_batch_cap"));

    if (!Number.isInteger(salesCycleDays) || salesCycleDays < 14 || salesCycleDays > 365) {
      return { status: "error", error: "Sales cycle must be between 14 and 365 days." };
    }
    if (
      !Number.isInteger(baselineLookbackDays) ||
      baselineLookbackDays < 30 ||
      baselineLookbackDays > 730
    ) {
      return { status: "error", error: "Baseline lookback must be between 30 and 730 days." };
    }
    if (
      !Number.isInteger(transcriptRetentionDays) ||
      transcriptRetentionDays < 30 ||
      transcriptRetentionDays > 1095
    ) {
      return { status: "error", error: "Transcript retention must be between 30 and 1095 days." };
    }
    if (!Number.isInteger(embargoHours) || embargoHours < 0 || embargoHours > 168) {
      return { status: "error", error: "Coaching delay must be between 0 and 168 hours." };
    }
    if (!Number.isInteger(batchCap) || batchCap < 1 || batchCap > 40) {
      return { status: "error", error: "Agent batch cap must be between 1 and 40 records." };
    }
    patch.sales_cycle_days = salesCycleDays;
    patch.baseline_lookback_days = baselineLookbackDays;
    patch.transcript_retention_days = transcriptRetentionDays;
    patch.call_coaching_embargo_hours = embargoHours;
    patch.operator_agent_batch_cap = batchCap;
  }

  if (Object.keys(patch).length === 0) {
    return { status: "error", error: "Nothing to save." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .update(patch)
    .eq("id", ctx.org.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { status: "error", error: "Could not save organization settings." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/app/settings/organization");
  revalidatePath("/app/settings/advanced");
  return { status: "saved" };
}
