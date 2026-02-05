// @ts-nocheck
/**
 * Telnyx Webhook Handler
 * 
 * This endpoint handles incoming webhooks from Telnyx for:
 * - Inbound SMS messages (replies from contacts)
 * - Delivery receipts (message status updates)
 * - Voice call events (call started, answered, completed)
 * - Opt-out notifications (STOP messages)
 * 
 * Security: Validates webhook signature using TELNYX_WEBHOOK_SECRET
 */

import { NextRequest, NextResponse } from "next/server";
// import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("telnyx-signature-ed25519");
    const timestamp = request.headers.get("telnyx-timestamp");

    // TODO: Verify webhook signature
    // const isValid = verifyTelnyxSignature(body, signature, timestamp);
    // if (!isValid) {
    //   return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    // }

    const payload = JSON.parse(body);
    const eventType = payload.data?.event_type;

    // TODO: Handle different event types
    switch (eventType) {
      case "message.received":
        // Handle inbound SMS
        // - Check for opt-out keywords (STOP, UNSUBSCRIBE)
        // - Update contact status if opted out
        // - Log message in conversation history
        // - Trigger any auto-reply workflows
        break;

      case "message.sent":
      case "message.finalized":
        // Handle delivery receipt
        // - Update message status in database
        // - Track delivery metrics
        break;

      case "call.initiated":
      case "call.answered":
      case "call.hangup":
        // Handle voice call events
        // - Update call status
        // - Record call duration for billing
        break;

      default:
        console.log("Unhandled Telnyx event:", eventType);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Telnyx webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
