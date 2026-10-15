"use server";

import { revalidatePath } from "next/cache";

import { getAuthContext } from "@/lib/auth/session";
import { API_LIMITS } from "@/lib/api/v1/limits";
import { builtInReport } from "@/lib/reports/builtin";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function saveReportSchedule(formData: FormData): Promise<{ message: string }> {
  const ctx = await getAuthContext();
  if (ctx.workspaceRole !== "owner") return { message: "Only an owner can schedule a report." };
  const report = builtInReport(String(formData.get("report") ?? ""));
  if (!report) return { message: "That report does not exist." };
  const cadence = formData.get("cadence") === "monthly" ? "monthly" : "weekly";
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { count } = await supabase
    .from("report_schedules")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.org.id)
    .eq("enabled", true);
  if ((count ?? 0) >= API_LIMITS.scheduledReports) {
    return { message: `This workspace already has ${API_LIMITS.scheduledReports} schedules.` };
  }
  const { error } = await supabase.from("report_schedules").insert({
    org_id: ctx.org.id,
    report_key: report.key,
    cadence,
    recipient_user_ids: [ctx.user.id],
    created_by: ctx.user.id,
    next_send_at: new Date().toISOString(),
  });
  if (error) return { message: "The schedule could not be saved." };
  revalidatePath(`/app/reports/${report.key}`);
  return { message: `Saved. It will email you ${cadence}.` };
}
