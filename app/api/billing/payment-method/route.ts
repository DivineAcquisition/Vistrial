import { NextResponse } from "next/server";

import { storePaymentMethod } from "@/lib/billing/payment-method";
import { createServiceClient } from "@/lib/supabase/server";
import type { Client } from "@/types/database";

export const dynamic = "force-dynamic";

/**
 * Where Stripe returns a client after they have added a card. The session id is
 * the only thing that comes back, and it is matched against the client it was
 * issued for; an unrecognised one is refused rather than trusted.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");

  if (url.searchParams.get("cancelled") === "1") {
    return NextResponse.redirect(new URL("/clients?payment_method=cancelled", url.origin));
  }

  if (!sessionId) {
    return NextResponse.redirect(new URL("/clients?payment_method=missing", url.origin));
  }

  const db = createServiceClient();

  const { data: client } = await db
    .from("clients")
    .select("*")
    .eq("payment_setup_session_id", sessionId)
    .returns<Client[]>()
    .maybeSingle();

  if (!client) {
    return NextResponse.redirect(new URL("/clients?payment_method=unknown", url.origin));
  }

  const result = await storePaymentMethod(db, client.id, sessionId);

  return NextResponse.redirect(
    new URL(
      `/clients/${client.id}?payment_method=${result.ok ? "added" : "failed"}`,
      url.origin
    )
  );
}
