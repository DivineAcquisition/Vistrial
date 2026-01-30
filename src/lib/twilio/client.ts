// ============================================
// VISTRIAL - Twilio Client
// SMS sending and logging functions
// ============================================

import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID!;
const authToken = process.env.TWILIO_AUTH_TOKEN!;
const fromNumber = process.env.TWILIO_PHONE_NUMBER!;

const client = twilio(accountSid, authToken);

export async function sendSMS(
  to: string,
  body: string
): Promise<string | null> {
  try {
    // Clean phone number
    const cleanPhone = to.replace(/\D/g, "");
    const formattedPhone = cleanPhone.startsWith("1")
      ? `+${cleanPhone}`
      : `+1${cleanPhone}`;

    const message = await client.messages.create({
      body,
      to: formattedPhone,
      from: fromNumber,
    });

    console.log(`SMS sent: ${message.sid}`);
    return message.sid;
  } catch (error) {
    console.error("Twilio SMS error:", error);
    return null;
  }
}

// Send SMS and log to database
export async function sendAndLogSMS(
  to: string,
  body: string,
  businessId: string,
  contactId: string,
  bookingId?: string,
  quoteId?: string
): Promise<boolean> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();

  const messageSid = await sendSMS(to, body);

  // Log message
  await supabase.from("messages").insert({
    business_id: businessId,
    contact_id: contactId,
    booking_id: bookingId || null,
    quote_id: quoteId || null,
    direction: "outbound",
    channel: "sms",
    body,
    status: messageSid ? "sent" : "failed",
    external_id: messageSid,
  });

  return !!messageSid;
}

// Export the Twilio client for advanced use cases
export { client as twilioClient };
