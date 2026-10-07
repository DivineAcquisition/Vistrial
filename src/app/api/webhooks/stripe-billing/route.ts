import { holdUnpluggedSource } from "@/lib/inbound/unplugged";

export const dynamic = "force-dynamic";

/**
 * Vistrial's own Stripe billing is not plugged in. Customer revenue arrives at
 * /api/sources/webhooks/stripe; this endpoint only holds events for review.
 */
export async function POST(request: Request) {
  return holdUnpluggedSource(request, "stripe_billing", "/api/webhooks/stripe-billing");
}
