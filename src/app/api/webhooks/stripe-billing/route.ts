import { NextResponse } from "next/server";

import { applyBillingEvent } from "@/lib/billing/events";
import { billingWebhookSecret } from "@/lib/billing/stripe";
import { holdInboundEvent } from "@/lib/inbound/holds";
import { holdUnpluggedSource, UNPLUGGED_MAX_BODY_BYTES } from "@/lib/inbound/unplugged";
import { recordHttpSample } from "@/lib/ops/alerts";
import { rateLimitWebhook } from "@/lib/ops/rate-limit";
import { verifyStripeSignature } from "@/lib/sources/processor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ROUTE = "/api/webhooks/stripe-billing";

/**
 * What workspaces pay Vistrial, from Vistrial's own Stripe account. Customer
 * revenue arrives at /api/sources/webhooks/stripe instead. Until the signing
 * secret is set, events are only held for review.
 */
export async function POST(request: Request) {
  const secret = billingWebhookSecret();
  if (!secret) return holdUnpluggedSource(request, "stripe_billing", ROUTE);

  const db = getSupabaseAdmin();
  const limited = await rateLimitWebhook(db, request, "stripe_billing");
  if (!limited.allowed) {
    await recordHttpSample(db, ROUTE, true);
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const raw = await request.text();
  if (raw.length > UNPLUGGED_MAX_BODY_BYTES) {
    await recordHttpSample(db, ROUTE, true);
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  if (!verifyStripeSignature(raw, request.headers.get("stripe-signature") ?? "", secret)) {
    await recordHttpSample(db, ROUTE, true);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(raw) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const outcome = await applyBillingEvent(event);
  if (outcome.action === "unmatched") {
    await holdInboundEvent(db, {
      source: "stripe_billing",
      reason: "unmatched",
      eventType: event.type ?? null,
      externalRef: event.id ?? null,
      routingKey: outcome.customerId,
      payload: event,
    });
    await recordHttpSample(db, ROUTE, false);
    return NextResponse.json({ ok: true, held: true });
  }
  await recordHttpSample(db, ROUTE, false);
  return NextResponse.json({ ok: true, applied: outcome.action === "applied" });
}
