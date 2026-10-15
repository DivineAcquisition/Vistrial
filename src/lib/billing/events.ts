import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { billingConfigured, syncWorkspaceBilling } from "@/lib/billing/stripe";
import { emailStaff, queuePortalNotice } from "@/lib/portal/notices";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type StripeEvent = { id?: string; type?: string; data?: { object?: Record<string, unknown> } };

export const BILLING_EVENT_TYPES = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.trial_will_end",
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "invoice.finalized",
]);

export type BillingEventOutcome =
  | { action: "ignored" }
  | { action: "unmatched"; customerId: string | null }
  | { action: "applied"; orgId: string; failureStarted: boolean };

function customerOf(object: Record<string, unknown> | undefined): string | null {
  const customer = object?.customer;
  if (typeof customer === "string") return customer;
  if (customer && typeof customer === "object" && typeof (customer as { id?: unknown }).id === "string") {
    return (customer as { id: string }).id;
  }
  return null;
}

/**
 * Apply one verified event from Vistrial's Stripe account to the workspace it
 * belongs to. Stripe is asked again for the current state rather than trusting
 * the event's order. Payment trouble only shows a notice; nothing is switched off.
 */
export async function applyBillingEvent(event: StripeEvent): Promise<BillingEventOutcome> {
  const type = event.type ?? "";
  if (!BILLING_EVENT_TYPES.has(type)) return { action: "ignored" };
  const object = event.data?.object;
  const customerId = customerOf(object);
  if (!customerId) return { action: "unmatched", customerId: null };

  const db = getSupabaseAdmin() as unknown as SupabaseClient;
  const { data } = await db
    .from("workspace_billing")
    .select("org_id, payment_failed_at")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  const row = data as { org_id: string; payment_failed_at: string | null } | null;
  if (!row) return { action: "unmatched", customerId };
  const orgId = row.org_id;
  const now = new Date().toISOString();

  if (type === "invoice.payment_failed") {
    await db
      .from("workspace_billing")
      .update({ payment_failed_at: row.payment_failed_at ?? now, last_invoice_status: "open", updated_at: now })
      .eq("org_id", orgId);
  } else if (type === "invoice.paid" || type === "invoice.payment_succeeded") {
    await db
      .from("workspace_billing")
      .update({ payment_failed_at: null, last_invoice_status: "paid", updated_at: now })
      .eq("org_id", orgId);
  }
  if (billingConfigured()) await syncWorkspaceBilling(orgId);
  if (type === "invoice.payment_failed") await db.rpc("billing_note_failure", { p_org_id: orgId });
  if (type === "invoice.paid" || type === "invoice.payment_succeeded") await db.rpc("billing_note_paid", { p_org_id: orgId });

  const { data: after } = await db.from("workspace_billing").select("payment_failed_at").eq("org_id", orgId).maybeSingle();
  const failureStarted = !row.payment_failed_at && Boolean((after as { payment_failed_at: string | null } | null)?.payment_failed_at);
  if (failureStarted) await tellAboutFailedPayment(orgId, event.id ?? `${customerId}:${now.slice(0, 10)}`);
  return { action: "applied", orgId, failureStarted };
}

async function tellAboutFailedPayment(orgId: string, ref: string): Promise<void> {
  const db = getSupabaseAdmin();
  const [{ data: owners }, { data: org }] = await Promise.all([
    db.from("org_members").select("id").eq("org_id", orgId).eq("role", "owner").eq("active", true),
    db.from("organizations").select("name").eq("id", orgId).maybeSingle(),
  ]);
  const name = org?.name ?? "Your workspace";
  await Promise.all(
    (owners ?? []).map((owner) =>
      queuePortalNotice({
        orgId,
        memberId: owner.id,
        eventType: "billing_issue",
        title: "A payment to Vistrial did not go through",
        body: "Everything keeps working. Open Billing to update the card, or reply to your team.",
        path: "/app/settings/billing",
        dedupeKey: `billing-failed:${orgId}:${ref}`,
      })
    )
  );
  await emailStaff({
    orgId,
    subject: `${name}: payment did not go through`,
    lines: [
      `The latest payment from ${name} failed in Stripe.`,
      "The owners have been told. Nothing in the workspace has been switched off.",
    ],
    href: "/app/settings/billing",
    ctaLabel: "Open billing",
    idempotencyKey: `billing-failed-staff:${orgId}:${ref}`,
  });
}
