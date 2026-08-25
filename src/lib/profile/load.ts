import "server-only";

import { redirect } from "next/navigation";

import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { notFound } from "next/navigation";
import {
  parseBusinessProfileState,
  parseDefaults,
  parseCompleteness,
} from "@/lib/profile/parse";
import type { ProfileStage } from "@/lib/profile/stages";
import type { StatedGoal } from "@/lib/profile/goal";
import { num, str } from "@/lib/profile/parse";
import type { BusinessProfileState, Completeness, ProfileDefaults } from "@/lib/profile/types";
import { createClient } from "@/lib/supabase/server";

/**
 * The profile is owner and admin only, the same gate revenue sits behind. A
 * setter who lands on one of these routes goes to their own profile page.
 */
export async function requireProfileAccess(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) {
    notFound();
  }
  return ctx;
}

export async function assertProfileAccess(): Promise<
  { ok: true; ctx: AuthContext } | { ok: false; error: string }
> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) {
    return { ok: false, error: "Only an owner or admin can change the business profile." };
  }
  return { ok: true, ctx };
}

export async function loadBusinessProfileState(orgId: string): Promise<BusinessProfileState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("business_profile_state", { p_org_id: orgId });
  if (error) throw new Error(`business_profile_state failed: ${error.message}`);
  return parseBusinessProfileState(data);
}

export async function loadProfileDefaults(orgId: string): Promise<ProfileDefaults> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("business_profile_defaults", { p_org_id: orgId });
  if (error) throw new Error(`business_profile_defaults failed: ${error.message}`);
  return parseDefaults(data);
}

export async function loadOnboardingPayoff(
  orgId: string,
  stage: ProfileStage
): Promise<Record<string, unknown>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("onboarding_payoff", {
    p_org_id: orgId,
    p_stage: stage,
  });
  if (error) throw new Error(`onboarding_payoff failed: ${error.message}`);
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}

export async function loadCompleteness(orgId: string): Promise<Completeness> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("business_profile_completeness", { p_org_id: orgId });
  if (error) throw new Error(`business_profile_completeness failed: ${error.message}`);
  return parseCompleteness(data);
}

export async function loadAdoptionWatch(orgId: string): Promise<Record<string, unknown>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adoption_watch", { p_org_id: orgId });
  if (error) throw new Error(`adoption_watch failed: ${error.message}`);
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}

export async function loadLatestLeakReport(orgId: string): Promise<Record<string, unknown> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("leak_report_latest", { p_org_id: orgId });
  if (error) throw new Error(`leak_report_latest failed: ${error.message}`);
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
}

export async function loadStatedGoal(orgId: string): Promise<StatedGoal | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("business_profiles")
    .select("goal_metric, goal_value")
    .eq("org_id", orgId)
    .maybeSingle();
  const metric = str(data?.goal_metric) as StatedGoal["metric"] | null;
  const value = num(data?.goal_value);
  if (!metric || value === null) return null;
  return { metric, value };
}
