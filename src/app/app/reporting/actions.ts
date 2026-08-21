"use server";

import { revalidatePath } from "next/cache";

import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runBaselineBackfill } from "@/lib/ghl/backfill";
import { revalidateOnboardingPaths } from "@/lib/onboarding/revalidate";

export type ReportingActionResult =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; error: string };

const initialDenied: ReportingActionResult = {
  status: "error",
  error: "You do not have permission to change reporting settings.",
};

export async function skipBaselineBackfill(
  _prev: ReportingActionResult,
  _formData: FormData
): Promise<ReportingActionResult> {
  void _prev;
  void _formData;
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) return initialDenied;
  const supabase = await createClient();
  const { error } = await supabase.rpc("skip_baseline_backfill", {
    p_org_id: ctx.org.id,
    p_member_id: ctx.member.id,
  });
  if (error) return { status: "error", error: error.message };
  revalidateOnboardingPaths();
  revalidatePath("/app/reporting");
  return { status: "saved" };
}

export async function rerunBaselineBackfill(
  _prev: ReportingActionResult,
  _formData: FormData
): Promise<ReportingActionResult> {
  void _prev;
  void _formData;
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) return initialDenied;
  const supabase = await createClient();
  const { error } = await supabase.rpc("enqueue_baseline_backfill", {
    p_org_id: ctx.org.id,
    p_member_id: ctx.member.id,
    p_replace: true,
  });
  if (error) return { status: "error", error: error.message };
  await runBaselineBackfill(getSupabaseAdmin());
  revalidateOnboardingPaths();
  return { status: "saved" };
}

export async function saveSelfReportedBaseline(
  _prev: ReportingActionResult,
  formData: FormData
): Promise<ReportingActionResult> {
  void _prev;
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) return initialDenied;
  const leads = Number(formData.get("leads_per_month"));
  const closes = Number(formData.get("clients_closed_per_month"));
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!Number.isInteger(leads) || leads < 1) {
    return { status: "error", error: "Leads per month must be a whole number of at least 1." };
  }
  if (!Number.isInteger(closes) || closes < 0) {
    return { status: "error", error: "Clients closed per month must be a whole number of at least 0." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_self_reported_baseline", {
    p_org_id: ctx.org.id,
    p_leads_per_month: leads,
    p_clients_closed_per_month: closes,
    p_note: note,
  });
  if (error) return { status: "error", error: error.message };
  await supabase
    .from("org_onboarding")
    .update({ baseline_fallback: "self_reported" })
    .eq("org_id", ctx.org.id);
  revalidateOnboardingPaths();
  revalidatePath("/app/reporting");
  return { status: "saved" };
}

export async function declineBaselineFallback(
  _prev: ReportingActionResult,
  _formData: FormData
): Promise<ReportingActionResult> {
  void _prev;
  void _formData;
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) return initialDenied;
  const supabase = await createClient();
  const { error } = await supabase
    .from("org_onboarding")
    .update({ baseline_fallback: "declined" })
    .eq("org_id", ctx.org.id);
  if (error) return { status: "error", error: error.message };
  revalidateOnboardingPaths();
  return { status: "saved" };
}
