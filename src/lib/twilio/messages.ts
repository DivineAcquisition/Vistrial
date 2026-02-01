import { createAdminClient } from "@/lib/supabase/admin";

// ============================================
// SMS SENDING UTILITY
// ============================================

async function sendSMS(to: string, body: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  // Normalize phone number
  const normalizedTo = normalizePhone(to);

  if (!normalizedTo) {
    return { success: false, error: "Invalid phone number" };
  }

  // Log in development or if Twilio not configured
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || process.env.NODE_ENV === "development") {
    console.log(`[SMS] To: ${normalizedTo}`);
    console.log(`[SMS] Body: ${body}`);
    return { success: true, sid: "dev-" + Date.now() };
  }

  try {
    const twilio = (await import("twilio")).default;
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    const message = await client.messages.create({
      to: normalizedTo,
      from: process.env.TWILIO_PHONE_NUMBER!,
      body,
    });

    return { success: true, sid: message.sid };
  } catch (error: any) {
    console.error("Twilio error:", error.message);
    return { success: false, error: error.message };
  }
}

function normalizePhone(phone: string): string | null {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, "");

  // US number: 10 digits or 11 starting with 1
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return null;
}

// ============================================
// MESSAGE TEMPLATES
// ============================================

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes || "00"} ${ampm}`;
}

// ============================================
// BOOKING CONFIRMATIONS
// ============================================

export async function sendBookingConfirmation(bookingId: string) {
  const admin = createAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select(`
      *,
      contacts(first_name, phone),
      businesses(name, phone)
    `)
    .eq("id", bookingId)
    .single();

  if (!booking || !(booking.contacts as any)?.phone) {
    return { success: false, error: "Booking or phone not found" };
  }

  const contact = booking.contacts as any;
  const business = booking.businesses as any;

  const message = `✅ Confirmed! Your cleaning with ${business?.name} is scheduled for ${formatDate(booking.scheduled_date)} at ${formatTime(booking.scheduled_time)}. We'll text you a reminder the day before!`;

  const result = await sendSMS(contact.phone, message);

  // Log message
  await admin.from("messages").insert({
    business_id: booking.business_id,
    contact_id: booking.contact_id,
    booking_id: bookingId,
    direction: "outbound",
    channel: "sms",
    body: message,
    status: result.success ? "sent" : "failed",
    external_id: result.sid,
    error_message: result.error,
  });

  return result;
}

// ============================================
// BOOKING REMINDERS
// ============================================

export async function sendBookingReminder(bookingId: string) {
  const admin = createAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select(`
      *,
      contacts(first_name, phone),
      businesses(name, phone)
    `)
    .eq("id", bookingId)
    .single();

  if (!booking || !(booking.contacts as any)?.phone) {
    return { success: false, error: "Booking or phone not found" };
  }

  const contact = booking.contacts as any;
  const business = booking.businesses as any;

  const message = `📅 Reminder: Your cleaning with ${business?.name} is tomorrow at ${formatTime(booking.scheduled_time)}. Reply HELP if you need to reschedule.`;

  const result = await sendSMS(contact.phone, message);

  await admin.from("messages").insert({
    business_id: booking.business_id,
    contact_id: booking.contact_id,
    booking_id: bookingId,
    direction: "outbound",
    channel: "sms",
    body: message,
    status: result.success ? "sent" : "failed",
    external_id: result.sid,
    message_type: "reminder",
  });

  // Mark reminder as sent
  await admin
    .from("bookings")
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq("id", bookingId);

  return result;
}

// ============================================
// QUOTE FOLLOW-UPS
// ============================================

export async function sendQuoteFollowUp(quoteId: string, dayNumber: number) {
  const admin = createAdminClient();

  const { data: quote } = await admin
    .from("quotes")
    .select(`
      *,
      contacts(first_name, phone),
      businesses(name)
    `)
    .eq("id", quoteId)
    .single();

  if (!quote || !(quote.contacts as any)?.phone) {
    return { success: false, error: "Quote or phone not found" };
  }

  const contact = quote.contacts as any;
  const business = quote.businesses as any;

  // Get template for this day
  const { data: template } = await admin
    .from("quote_message_templates")
    .select("body")
    .eq("business_id", quote.business_id)
    .eq("trigger_type", "quote_followup")
    .eq("trigger_day", dayNumber)
    .eq("is_active", true)
    .single();

  // Default message if no template
  const defaultMessage = `Hi ${contact.first_name || "there"}! Just checking in on your quote from ${business?.name}. Ready to book? View your quote: ${process.env.NEXT_PUBLIC_APP_URL}/q/${quote.token}`;

  const templateBody = template?.body || defaultMessage;

  // Replace variables
  const quoteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/q/${quote.token}`;
  const message = templateBody
    .replace(/\{\{first_name\}\}/g, contact.first_name || "there")
    .replace(/\{\{business_name\}\}/g, business?.name || "us")
    .replace(/\{\{quote_link\}\}/g, quoteUrl)
    .replace(/\{\{total\}\}/g, `$${quote.total}`);

  const result = await sendSMS(contact.phone, message);

  await admin.from("messages").insert({
    business_id: quote.business_id,
    contact_id: quote.contact_id,
    quote_id: quoteId,
    direction: "outbound",
    channel: "sms",
    body: message,
    status: result.success ? "sent" : "failed",
    external_id: result.sid,
    message_type: "quote_followup",
  });

  // Update quote
  await admin
    .from("quotes")
    .update({
      last_followup_at: new Date().toISOString(),
      followup_count: (quote.followup_count || 0) + 1,
    })
    .eq("id", quoteId);

  return result;
}

// ============================================
// MEMBERSHIP NOTIFICATIONS
// ============================================

export async function sendPaymentFailedNotice(membershipId: string) {
  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("memberships")
    .select(`
      *,
      contacts(first_name, phone),
      businesses(name, slug)
    `)
    .eq("id", membershipId)
    .single();

  if (!membership || !(membership.contacts as any)?.phone) {
    return { success: false, error: "Membership or phone not found" };
  }

  const contact = membership.contacts as any;
  const business = membership.businesses as any;

  const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/portal/${business?.slug}`;
  const message = `⚠️ Hi ${contact.first_name}, we couldn't process your payment for ${business?.name}. Please update your card at ${portalUrl} to keep your membership active.`;

  const result = await sendSMS(contact.phone, message);

  await admin.from("messages").insert({
    business_id: membership.business_id,
    contact_id: membership.contact_id,
    membership_id: membershipId,
    direction: "outbound",
    channel: "sms",
    body: message,
    status: result.success ? "sent" : "failed",
    external_id: result.sid,
    message_type: "payment_failed",
  });

  return result;
}

export async function sendMembershipPausedNotice(membershipId: string) {
  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("memberships")
    .select(`
      *,
      contacts(first_name, phone),
      businesses(name, phone)
    `)
    .eq("id", membershipId)
    .single();

  if (!membership || !(membership.contacts as any)?.phone) {
    return { success: false, error: "Membership or phone not found" };
  }

  const contact = membership.contacts as any;
  const business = membership.businesses as any;

  const message = `✋ Your cleaning membership with ${business?.name} has been paused. When you're ready to resume, just let us know or visit your customer portal!`;

  return sendSMS(contact.phone, message);
}

// ============================================
// REVIEW REQUESTS
// ============================================

export async function sendReviewRequest(bookingId: string) {
  const admin = createAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select(`
      *,
      contacts(first_name, phone),
      businesses(name, google_review_link)
    `)
    .eq("id", bookingId)
    .single();

  if (!booking || !(booking.contacts as any)?.phone) {
    return { success: false, error: "Booking or phone not found" };
  }

  const contact = booking.contacts as any;
  const business = booking.businesses as any;

  const reviewLink = business?.google_review_link || "";
  if (!reviewLink) {
    return { success: false, error: "No review link configured" };
  }

  const message = `⭐ Thanks for choosing ${business?.name}! We'd love your feedback. Leave us a quick review: ${reviewLink}`;

  const result = await sendSMS(contact.phone, message);

  await admin.from("messages").insert({
    business_id: booking.business_id,
    contact_id: booking.contact_id,
    booking_id: bookingId,
    direction: "outbound",
    channel: "sms",
    body: message,
    status: result.success ? "sent" : "failed",
    external_id: result.sid,
    message_type: "review_request",
  });

  await admin
    .from("bookings")
    .update({ review_requested_at: new Date().toISOString() })
    .eq("id", bookingId);

  return result;
}
