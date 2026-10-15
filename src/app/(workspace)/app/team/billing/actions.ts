"use server";

import { revalidatePath } from "next/cache";

import { getAuthContext } from "@/lib/auth/session";
import { assertRecentAuth } from "@/lib/staff/mfa-check";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export type BillingActionResult = { ok: true } | { ok: false; error: string };

async function admin() {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) return null;
  await assertRecentAuth("/app/team/billing");
  return ctx;
}

export async function assignPlan(orgId: string, planId: string, reason: string, pilotEndsOn: string): Promise<BillingActionResult> {
  const ctx = await admin();
  if (!ctx) return { ok: false, error: "Only a Platform Admin can change a plan." };
  if (reason.trim().length < 2) return { ok: false, error: "A reason is required." };
  const db = getSupabaseAdmin() as unknown as SupabaseClient;
  const { error } = await db.rpc("billing_assign_plan", {
    p_org_id: orgId,
    p_plan_id: planId,
    p_reason: reason.trim(),
    p_pilot_ends_on: planId === "pilot" ? pilotEndsOn || null : null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/team/billing");
  return { ok: true };
}

export async function setQuote(orgId: string, dollars: string, reason: string, secondAdmin: string): Promise<BillingActionResult> {
  const ctx = await admin();
  if (!ctx) return { ok: false, error: "Only a Platform Admin can set a price." };
  const cents = Math.round(Number(dollars) * 100);
  if (!Number.isFinite(cents) || cents < 0) return { ok: false, error: "Enter a price." };
  const db = getSupabaseAdmin() as unknown as SupabaseClient;
  const { error } = await db.rpc("billing_set_quote", {
    p_org_id: orgId,
    p_cents: cents,
    p_reason: reason.trim(),
    p_second_admin: secondAdmin.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/team/billing");
  return { ok: true };
}

export async function requestCredit(orgId: string, dollars: string, kind: "credit" | "refund", reason: string, secondAdmin: string): Promise<BillingActionResult> {
  const ctx = await admin();
  if (!ctx) return { ok: false, error: "Only a Platform Admin can do that." };
  const cents = Math.round(Number(dollars) * 100);
  const db = getSupabaseAdmin() as unknown as SupabaseClient;
  const { error } = await db.rpc("billing_request_credit", {
    p_org_id: orgId,
    p_cents: cents,
    p_reason: reason.trim(),
    p_kind: kind,
    p_second_admin: secondAdmin.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/team/billing");
  return { ok: true };
}
