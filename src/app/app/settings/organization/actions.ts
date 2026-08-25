"use server";

import { revalidatePath } from "next/cache";

import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { logSettingsActivity } from "@/lib/settings/activity";
import { canWriteAdvancedSettings, isOwner } from "@/lib/settings/managed";
import { loadOrgManaged } from "@/lib/settings/org";
import { revalidateSettings } from "@/lib/settings/revalidate";
import { createClient } from "@/lib/supabase/server";
import { isOrgTimezone } from "@/lib/timezones";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import {
  TRANSCRIPT_RETENTION_MAX_DAYS,
  TRANSCRIPT_RETENTION_MIN_DAYS,
} from "@/lib/ops/constants";

function deny(): SettingsSaveResult {
  return { status: "error", error: "You do not have permission to change that." };
}

export async function updateWorkspaceBasics(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) return deny();

  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "");
  const workingHoursStart = String(formData.get("working_hours_start") ?? "").trim();
  const workingHoursEnd = String(formData.get("working_hours_end") ?? "").trim();
  const workingDays = formData
    .getAll("working_days")
    .map((value) => Number(value))
    .filter((day) => day >= 1 && day <= 7);

  if (!name) return { status: "error", error: "Organization name is required." };
  if (name.length > 120) return { status: "error", error: "Organization name is too long." };
  if (!isOrgTimezone(timezone)) return { status: "error", error: "Choose a supported timezone." };
  if (!/^\d{2}:\d{2}$/.test(workingHoursStart) || !/^\d{2}:\d{2}$/.test(workingHoursEnd)) {
    return { status: "error", error: "Working hours must be a start and end time." };
  }
  if (workingDays.length === 0) return { status: "error", error: "Choose at least one working day." };

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("organizations")
    .select("name, timezone, working_hours_start, working_hours_end, working_days")
    .eq("id", ctx.org.id)
    .maybeSingle();
  const { data, error } = await supabase
    .from("organizations")
    .update({
      name,
      timezone,
      working_hours_start: workingHoursStart,
      working_hours_end: workingHoursEnd,
      working_days: workingDays,
    })
    .eq("id", ctx.org.id)
    .select("id")
    .maybeSingle();

  if (error || !data) return { status: "error", error: "Could not save business basics." };

  await logSettingsActivity({
    ctx,
    section: "organization",
    action: "Updated business name, timezone, or hours",
    from: before,
    to: { name, timezone, workingHoursStart, workingHoursEnd, workingDays },
  });

  revalidatePath("/", "layout");
  revalidateSettings();
  return { status: "saved" };
}

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
  const managed = await loadOrgManaged(ctx.org.id);
  if (!canWriteAdvancedSettings(ctx, managed.managed)) {
    return {
      status: "error",
      error: "These settings are managed by your install team. Take over management, or ask them to make the change.",
    };
  }

  const salesCycleDays = Number(formData.get("sales_cycle_days"));
  const baselineLookbackDays = Number(formData.get("baseline_lookback_days"));
  const embargoHours = Number(formData.get("call_coaching_embargo_hours"));
  const batchCap = Number(formData.get("operator_agent_batch_cap"));

  if (!Number.isInteger(salesCycleDays) || salesCycleDays < 14 || salesCycleDays > 365) {
    return { status: "error", error: "Sales cycle must be between 14 and 365 days." };
  }
  if (!Number.isInteger(baselineLookbackDays) || baselineLookbackDays < 30 || baselineLookbackDays > 730) {
    return { status: "error", error: "Baseline lookback must be between 30 and 730 days." };
  }
  if (!Number.isInteger(embargoHours) || embargoHours < 0 || embargoHours > 168) {
    return { status: "error", error: "Coaching delay must be between 0 and 168 hours." };
  }
  if (!Number.isInteger(batchCap) || batchCap < 1 || batchCap > 40) {
    return { status: "error", error: "Agent batch cap must be between 1 and 40 records." };
  }

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("organizations")
    .select("sales_cycle_days, baseline_lookback_days, call_coaching_embargo_hours, operator_agent_batch_cap")
    .eq("id", ctx.org.id)
    .maybeSingle();
  const { data, error } = await supabase
    .from("organizations")
    .update({
      sales_cycle_days: salesCycleDays,
      baseline_lookback_days: baselineLookbackDays,
      call_coaching_embargo_hours: embargoHours,
      operator_agent_batch_cap: batchCap,
    })
    .eq("id", ctx.org.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { status: "error", error: "Could not save organization settings." };
  }

  await logSettingsActivity({
    ctx,
    section: "organization",
    action: "Updated sales cycle, baseline lookback, coaching delay, or agent batch cap",
    from: before,
    to: { salesCycleDays, baselineLookbackDays, embargoHours, batchCap },
  });

  revalidatePath("/", "layout");
  revalidatePath("/app/settings/organization");
  revalidateSettings();
  return { status: "saved" };
}

export async function updateTranscriptRetention(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!isOwner(ctx)) return deny();
  const managed = await loadOrgManaged(ctx.org.id);
  if (!canWriteAdvancedSettings(ctx, managed.managed)) {
    return {
      status: "error",
      error: "These settings are managed by your install team. Take over management, or ask them to make the change.",
    };
  }
  const days = Number(formData.get("transcript_retention_days"));
  if (
    !Number.isInteger(days) ||
    days < TRANSCRIPT_RETENTION_MIN_DAYS ||
    days > TRANSCRIPT_RETENTION_MAX_DAYS
  ) {
    return {
      status: "error",
      error: `Transcript retention must be between ${TRANSCRIPT_RETENTION_MIN_DAYS} and ${TRANSCRIPT_RETENTION_MAX_DAYS} days.`,
    };
  }
  const supabase = await createClient();
  const { data: before } = await supabase
    .from("organizations")
    .select("transcript_retention_days")
    .eq("id", ctx.org.id)
    .maybeSingle();
  const { error } = await supabase
    .from("organizations")
    .update({ transcript_retention_days: days })
    .eq("id", ctx.org.id);
  if (error) return { status: "error", error: "Could not save transcript retention." };
  await logSettingsActivity({
    ctx,
    section: "data",
    action: "Updated transcript retention",
    from: before,
    to: { days },
  });
  revalidateSettings();
  return { status: "saved" };
}
