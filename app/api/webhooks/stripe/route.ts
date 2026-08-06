import { after, NextResponse } from "next/server";

import { receiveStripeEvent } from "@/lib/billing/stripe-events";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Stripe's own webhook. Point a live-mode endpoint at this and subscribe to
 * `payment_intent.succeeded`, `payment_intent.payment_failed`, the
 * `charge.dispute.*` family, `setup_intent.succeeded`, and
 * `payment_method.automatically_updated`.
 *
 * The body is read as text and verified before it is parsed, because the
 * signature covers the exact bytes Stripe sent and any re-serialisation breaks
 * it. Acknowledged first and processed after, as Stripe expects.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  const receipt = await receiveStripeEvent(createServiceClient(), {
    rawBody,
    signature: request.headers.get("stripe-signature"),
  });

  if (receipt.process) {
    after(receipt.process);
  }

  return NextResponse.json(receipt.body, { status: receipt.status });
}
