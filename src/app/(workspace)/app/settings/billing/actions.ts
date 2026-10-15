"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { SettingsSaveResult } from "@/app/(workspace)/app/settings/types";
import { getAuthContext } from "@/lib/auth/session";
import {
  billingConfigured,
  createPortalSession,
  CUSTOMER_ID,
  fetchCustomer,
  syncWorkspaceBilling,
} from "@/lib/billing/stripe";
import { absoluteUrl } from "@/lib/portal/notices";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PATH = "/app/settings/billing";

async function mayOpen(orgId: string): Promise<boolean> {
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data } = await db.rpc("portal_can_see_billing", { p_org_id: orgId });
  return data === true;
}

/** Platform Admin only: point this workspace at its customer in Vistrial's Stripe account. */
export async function linkStripeCustomer(_prev: SettingsSaveResult, formData: FormData): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) return { status: "error", error: "Only a Platform Admin can link billing." };
  if (!billingConfigured()) return { status: "error", error: "Add STRIPE_SECRET_KEY to the environment first." };
  const customerId = String(formData.get("customer_id") ?? "").trim();
  if (!CUSTOMER_ID.test(customerId)) return { status: "error", error: "Paste a Stripe customer id that starts with cus_." };

  const customer = await fetchCustomer(customerId);
  if (!customer.ok) return { status: "error", error: customer.error };

  const admin = getSupabaseAdmin() as unknown as SupabaseClient;
  const { data: taken } = await admin
    .from("workspace_billing")
    .select("org_id")
    .eq("stripe_customer_id", customerId)
    .neq("org_id", ctx.org.id)
    .maybeSingle();
  if (taken) return { status: "error", error: "That customer is already linked to another workspace." };

  const { error } = await admin.from("workspace_billing").upsert(
    {
      org_id: ctx.org.id,
      stripe_customer_id: customerId,
      linked_by_user_id: ctx.user.id,
      linked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id" }
  );
  if (error) return { status: "error", error: "Could not save the link." };

  const synced = await syncWorkspaceBilling(ctx.org.id);
  revalidatePath(PATH);
  if (!synced.ok) return { status: "error", error: `Linked, but reading the plan failed: ${synced.error}` };
  return { status: "saved" };
}

export async function unlinkStripeCustomer(): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) return { status: "error", error: "Only a Platform Admin can change billing." };
  const admin = getSupabaseAdmin() as unknown as SupabaseClient;
  const { error } = await admin.from("workspace_billing").delete().eq("org_id", ctx.org.id);
  if (error) return { status: "error", error: "Could not remove the link." };
  revalidatePath(PATH);
  return { status: "saved" };
}

export async function refreshBilling(): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!(await mayOpen(ctx.org.id))) return { status: "error", error: "Billing is not open to you." };
  const synced = await syncWorkspaceBilling(ctx.org.id);
  revalidatePath(PATH);
  return synced.ok ? { status: "saved" } : { status: "error", error: synced.error };
}

/** Owners cancel from Billing. The database keeps access until the period ends. */
export async function cancelPlan(_prev: SettingsSaveResult, formData: FormData): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (ctx.workspaceRole !== "owner" && !ctx.isPlatformAdmin) {
    return { status: "error", error: "Only an owner can cancel." };
  }
  const db = (await createClient()) as unknown as SupabaseClient;
  const reason = String(formData.get("reason") ?? "").trim();
  const { error } = await db.rpc("billing_cancel", { p_org_id: ctx.org.id, p_reason: reason || null });
  if (error) return { status: "error", error: "Could not schedule the cancellation." };
  revalidatePath(PATH);
  return { status: "saved" };
}

/** Owners only: the hosted page where they can update the card or download receipts. */
export async function openBillingPortal(): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (ctx.workspaceRole !== "owner" && !ctx.isPlatformAdmin) {
    return { status: "error", error: "Only an owner can manage the payment method." };
  }
  if (!(await mayOpen(ctx.org.id))) return { status: "error", error: "Billing is not open to you." };
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data } = await db.from("workspace_billing").select("stripe_customer_id").eq("org_id", ctx.org.id).maybeSingle();
  const customerId = (data as { stripe_customer_id: string | null } | null)?.stripe_customer_id;
  if (!customerId) return { status: "error", error: "Billing is not linked yet. Your team will set it up." };
  const session = await createPortalSession(customerId, absoluteUrl(PATH));
  if (!session.ok) return { status: "error", error: session.error };
  redirect(session.data.url);
}
