import { NextResponse } from "next/server";

import { recordHttpSample } from "@/lib/ops/alerts";
import { rateLimitWebhook } from "@/lib/ops/rate-limit";
import {
  findOrgByStripeAccount,
  ingestProcessorEvent,
  verifyStripeSignature,
} from "@/lib/sources/processor";
import { stripeWebhookSecret } from "@/lib/sources/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
  const db = getSupabaseAdmin();
  const limited = await rateLimitWebhook(db, request, "stripe");
  if (!limited.allowed) {
    await recordHttpSample(db, "/api/sources/webhooks/stripe", true);
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const rawBody = await request.text();
  const secret = stripeWebhookSecret();
  const header = request.headers.get("stripe-signature") ?? "";
  if (!secret) {
    await recordHttpSample(db, "/api/sources/webhooks/stripe", true);
    return NextResponse.json({ error: "Stripe webhooks are not configured." }, { status: 503 });
  }
  if (!verifyStripeSignature(rawBody, header, secret)) {
    await recordHttpSample(db, "/api/sources/webhooks/stripe", true);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = asRecord(JSON.parse(rawBody) as unknown);
  const type = asString(event?.type) ?? "";
  const object = asRecord(asRecord(event?.data)?.object);
  const account = asString(event?.account) ?? asString(object?.account);
  if (!object) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  const orgId = account ? await findOrgByStripeAccount(db, account) : null;
  if (!orgId) {
    await recordHttpSample(db, "/api/sources/webhooks/stripe", false);
    return NextResponse.json({ ok: true, unmatched_org: true });
  }

  const amount = Number(object.amount ?? object.amount_refunded ?? object.amount_captured ?? 0);
  const currency = asString(object.currency) ?? "usd";
  const id = asString(object.id) ?? asString(event?.id);
  const created = typeof object.created === "number" ? new Date(object.created * 1000).toISOString() : new Date().toISOString();
  const email =
    asString(asRecord(object.billing_details)?.email) ??
    asString(object.receipt_email) ??
    asString(asRecord(object.customer_details)?.email);
  const meta = asRecord(object.metadata);
  const leadId = asString(meta?.vistrial_lead_id) ?? asString(meta?.lead_id);

  if (!id || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const kind =
    type.includes("refund") || type === "charge.refunded"
      ? "refund"
      : type.includes("dispute") || type.includes("chargeback")
        ? "chargeback"
        : type.includes("failed") || type.includes("payment_failed")
          ? "failed"
          : type.includes("succeeded") || type === "charge.succeeded" || type === "checkout.session.completed"
            ? "sale"
            : null;
  if (!kind) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  await ingestProcessorEvent(db, {
    orgId,
    processor: "stripe",
    kind,
    amountCents: amount,
    currency,
    processorRef: id,
    occurredAt: created,
    leadId,
    email,
  });
  await recordHttpSample(db, "/api/sources/webhooks/stripe", false);
  return NextResponse.json({ ok: true });
}
