import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ghlError } from "@/lib/ghl/log";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Vistrial's own Stripe account, for what each workspace pays Vistrial. This
 * only reads: customers, subscriptions, and invoices are created in Stripe by
 * the team. The one thing it creates is a short-lived portal session, and only
 * when a Vistrial portal configuration has been set.
 */

const API = "https://api.stripe.com/v1";

export function billingSecretKey(): string {
  return process.env.STRIPE_SECRET_KEY?.trim() ?? "";
}

export function billingWebhookSecret(): string {
  return process.env.STRIPE_BILLING_WEBHOOK_SECRET?.trim() ?? "";
}

export function billingPortalConfiguration(): string {
  return process.env.STRIPE_PORTAL_CONFIGURATION_ID?.trim() ?? "";
}

export function billingConfigured(): boolean {
  return Boolean(billingSecretKey());
}

export const CUSTOMER_ID = /^cus_[A-Za-z0-9]{6,}$/;

type StripeResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

function encode(params: Record<string, string | string[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) search.append(key, item);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

async function stripeRequest<T>(
  method: "GET" | "POST",
  path: string,
  params: Record<string, string | string[] | undefined> = {}
): Promise<StripeResult<T>> {
  const key = billingSecretKey();
  if (!key) return { ok: false, error: "Billing is not connected yet.", status: 503 };
  const query = method === "GET" ? encode(params) : "";
  const body = method === "POST" ? encode(params).slice(1) : undefined;
  try {
    const response = await fetch(`${API}${path}${query}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body !== undefined ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await response.json().catch(() => ({}))) as { error?: { message?: string } } & T;
    if (!response.ok) {
      return { ok: false, error: json.error?.message ?? `Stripe answered ${response.status}.`, status: response.status };
    }
    return { ok: true, data: json };
  } catch (caught) {
    return { ok: false, error: caught instanceof Error ? caught.message : "Stripe did not answer.", status: 502 };
  }
}

type StripePrice = {
  unit_amount: number | null;
  currency: string;
  recurring: { interval: string; interval_count: number } | null;
  nickname: string | null;
  product: string | { name?: string; metadata?: Record<string, string> } | null;
};

type StripeSubscription = {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  trial_end: number | null;
  current_period_start?: number;
  current_period_end?: number;
  items: {
    data: Array<{ price: StripePrice; quantity?: number; current_period_start?: number; current_period_end?: number }>;
  };
  latest_invoice: string | { status: string | null } | null;
};

type StripeCustomer = { id: string; deleted?: boolean; name: string | null; email: string | null };

export type BillingInvoice = {
  id: string;
  number: string | null;
  status: string | null;
  amountDue: number;
  amountPaid: number;
  currency: string;
  created: string;
  periodEnd: string | null;
  hostedUrl: string | null;
  pdfUrl: string | null;
};

const iso = (seconds: number | null | undefined) => (typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null);

function productParts(product: StripePrice["product"]): { name: string | null; metadata: Record<string, string> } {
  if (product && typeof product === "object") return { name: product.name ?? null, metadata: product.metadata ?? {} };
  return { name: null, metadata: {} };
}

/** Limits and features the team writes on the Stripe product, as metadata. */
export function readPlanMetadata(metadata: Record<string, string>): { limits: Record<string, number>; features: string[] } {
  const limits: Record<string, number> = {};
  let features: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (key.startsWith("limit_")) {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) limits[key.slice(6)] = n;
    }
    if (key === "features") {
      features = value
        .split(/[|\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 20);
    }
  }
  return { limits, features };
}

export async function fetchCustomer(customerId: string): Promise<StripeResult<StripeCustomer>> {
  if (!CUSTOMER_ID.test(customerId)) return { ok: false, error: "That is not a Stripe customer id.", status: 400 };
  const result = await stripeRequest<StripeCustomer>("GET", `/customers/${customerId}`);
  if (result.ok && result.data.deleted) return { ok: false, error: "That customer was deleted in Stripe.", status: 404 };
  return result;
}

/** Pick the subscription that describes the workspace now: live ones first, then the newest. */
function pickSubscription(subscriptions: StripeSubscription[]): StripeSubscription | null {
  const rank = (status: string) =>
    ["active", "past_due", "trialing", "unpaid", "incomplete", "paused"].includes(status) ? 0 : 1;
  return [...subscriptions].sort((a, b) => rank(a.status) - rank(b.status))[0] ?? null;
}

/**
 * Read the customer's subscription from Stripe and store it on the workspace.
 * Fields Stripe does not have stay empty; nothing is guessed.
 */
export async function syncWorkspaceBilling(orgId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getSupabaseAdmin() as unknown as SupabaseClient;
  const { data: row } = await db
    .from("workspace_billing")
    .select("stripe_customer_id, payment_failed_at")
    .eq("org_id", orgId)
    .maybeSingle();
  const current = row as { stripe_customer_id: string | null; payment_failed_at: string | null } | null;
  const customerId = current?.stripe_customer_id;
  if (!customerId) return { ok: false, error: "No Stripe customer is linked to this workspace." };

  const subs = await stripeRequest<{ data: StripeSubscription[] }>("GET", "/subscriptions", {
    customer: customerId,
    status: "all",
    limit: "10",
    "expand[]": ["data.items.data.price.product", "data.latest_invoice"],
  });
  if (!subs.ok) {
    ghlError("billing.sync.failed", { orgId, error: subs.error });
    return { ok: false, error: subs.error };
  }

  const sub = pickSubscription(subs.data.data);
  const item = sub?.items.data[0];
  const price = item?.price;
  const product = productParts(price?.product ?? null);
  const plan = readPlanMetadata(product.metadata);
  const invoiceStatus =
    sub?.latest_invoice && typeof sub.latest_invoice === "object" ? sub.latest_invoice.status : null;
  const failing = sub ? ["past_due", "unpaid"].includes(sub.status) : false;
  // A failed invoice can leave the subscription "active" while Stripe retries;
  // the flag clears only once the latest invoice is paid.
  const failedAt = failing
    ? (current?.payment_failed_at ?? new Date().toISOString())
    : !sub || invoiceStatus === "paid"
      ? null
      : (current?.payment_failed_at ?? null);

  const { error } = await db
    .from("workspace_billing")
    .update({
      stripe_subscription_id: sub?.id ?? null,
      status: sub?.status ?? null,
      plan_name: product.name ?? price?.nickname ?? null,
      price_cents: price?.unit_amount != null ? price.unit_amount * (item?.quantity ?? 1) : null,
      currency: price?.currency ?? null,
      billing_interval: price?.recurring?.interval ?? null,
      interval_count: price?.recurring?.interval_count ?? null,
      current_period_start: iso(sub?.current_period_start ?? item?.current_period_start),
      current_period_end: iso(sub?.current_period_end ?? item?.current_period_end),
      cancel_at_period_end: sub?.cancel_at_period_end ?? false,
      canceled_at: iso(sub?.canceled_at),
      trial_end: iso(sub?.trial_end),
      payment_failed_at: failedAt,
      last_invoice_status: invoiceStatus,
      limits: plan.limits,
      features: plan.features,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", orgId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listInvoices(customerId: string): Promise<StripeResult<BillingInvoice[]>> {
  const result = await stripeRequest<{
    data: Array<{
      id: string;
      number: string | null;
      status: string | null;
      amount_due: number;
      amount_paid: number;
      currency: string;
      created: number;
      period_end: number | null;
      hosted_invoice_url: string | null;
      invoice_pdf: string | null;
    }>;
  }>("GET", "/invoices", { customer: customerId, limit: "12" });
  if (!result.ok) return result;
  return {
    ok: true,
    data: result.data.data
      .filter((invoice) => invoice.status !== "draft")
      .map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        amountDue: invoice.amount_due,
        amountPaid: invoice.amount_paid,
        currency: invoice.currency,
        created: new Date(invoice.created * 1000).toISOString(),
        periodEnd: iso(invoice.period_end),
        hostedUrl: invoice.hosted_invoice_url,
        pdfUrl: invoice.invoice_pdf,
      })),
  };
}

/** Only with a Vistrial-branded configuration, so the customer never lands on an unbranded page. */
export async function createPortalSession(customerId: string, returnUrl: string): Promise<StripeResult<{ url: string }>> {
  const configuration = billingPortalConfiguration();
  if (!configuration) return { ok: false, error: "Self-serve billing is not open yet.", status: 503 };
  return stripeRequest<{ url: string }>("POST", "/billing_portal/sessions", {
    customer: customerId,
    return_url: returnUrl,
    configuration,
  });
}
