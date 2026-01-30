// ============================================
// VISTRIAL - Inbound SMS Webhook Handler
// Handles incoming SMS from Twilio
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import twilio from "twilio";

export async function POST(request: NextRequest) {
  const body = await request.formData();

  // Validate Twilio signature
  const twilioSignature = request.headers.get("x-twilio-signature");
  const url = request.url;

  const params: Record<string, string> = {};
  body.forEach((value, key) => {
    params[key] = value.toString();
  });

  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN!,
    twilioSignature || "",
    url,
    params
  );

  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const from = params.From;
  const messageBody = params.Body?.trim().toUpperCase();
  const messageSid = params.MessageSid;

  const supabase = createAdminClient();

  // Find contact by phone
  const cleanPhone = from.replace(/\D/g, "").replace(/^1/, "");

  const { data: contact } = await supabase
    .from("contacts")
    .select("*, businesses(id, name)")
    .eq("phone", cleanPhone)
    .single();

  if (!contact) {
    // Log unknown sender
    console.log(`Unknown sender: ${from}, message: ${messageBody}`);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
      <Response></Response>`,
      { headers: { "Content-Type": "application/xml" } }
    );
  }

  // Log inbound message
  await supabase.from("messages").insert({
    business_id: contact.business_id,
    contact_id: contact.id,
    direction: "inbound",
    channel: "sms",
    body: params.Body,
    status: "received",
    external_id: messageSid,
  });

  // Handle keywords
  let responseMessage = "";

  if (messageBody === "PAUSE" || messageBody === "SKIP") {
    // Pause next membership service
    const { data: membership } = await supabase
      .from("memberships")
      .select("*")
      .eq("contact_id", contact.id)
      .eq("status", "active")
      .single();

    if (membership) {
      // Skip next service
      const nextDate = new Date(membership.next_service_date);
      nextDate.setDate(nextDate.getDate() + membership.frequency_days);

      await supabase
        .from("memberships")
        .update({ next_service_date: nextDate.toISOString().split("T")[0] })
        .eq("id", membership.id);

      responseMessage = `Got it! Your next cleaning has been skipped. Your new next service date is ${nextDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`;
    }
  } else if (messageBody === "STOP" || messageBody === "CANCEL") {
    responseMessage =
      "To cancel your membership, please visit your customer portal or call us. Reply HELP for assistance.";
  } else if (messageBody === "HELP") {
    responseMessage = `${contact.businesses.name} - Reply PAUSE to skip your next cleaning, or contact us for help.`;
  }

  // Send response if we have one
  if (responseMessage) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Message>${responseMessage}</Message>
      </Response>`,
      { headers: { "Content-Type": "application/xml" } }
    );
  }

  // No auto-response, just acknowledge
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
    <Response></Response>`,
    { headers: { "Content-Type": "application/xml" } }
  );
}
