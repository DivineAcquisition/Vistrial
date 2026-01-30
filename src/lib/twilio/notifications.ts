// ============================================
// VISTRIAL - High-level Notification Functions
// Business logic for sending various notifications
// ============================================

import { sendAndLogSMS } from "./client";
import {
  SMS_TEMPLATES,
  formatDateForSMS,
  formatTimeForSMS,
  type SMSTemplateData,
} from "./templates";
import { createAdminClient } from "@/lib/supabase/admin";

// Send booking confirmation
export async function sendBookingConfirmation(
  bookingId: string
): Promise<boolean> {
  const supabase = createAdminClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      `
      *,
      contacts(id, phone, first_name),
      businesses(id, name)
    `
    )
    .eq("id", bookingId)
    .single();

  if (!booking?.contacts?.phone) return false;

  const templateData: SMSTemplateData = {
    businessName: booking.businesses.name,
    customerName: booking.contacts.first_name,
    date: formatDateForSMS(booking.scheduled_date),
    time: formatTimeForSMS(booking.scheduled_time),
  };

  const message = SMS_TEMPLATES.bookingConfirmation(templateData);

  return sendAndLogSMS(
    booking.contacts.phone,
    message,
    booking.business_id,
    booking.contacts.id,
    booking.id
  );
}

// Send booking reminder
export async function sendBookingReminder(
  bookingId: string,
  type: "day_before" | "same_day" = "day_before"
): Promise<boolean> {
  const supabase = createAdminClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      `
      *,
      contacts(id, phone, first_name),
      businesses(id, name)
    `
    )
    .eq("id", bookingId)
    .single();

  if (!booking?.contacts?.phone) return false;

  const templateData: SMSTemplateData = {
    businessName: booking.businesses.name,
    customerName: booking.contacts.first_name,
    date: formatDateForSMS(booking.scheduled_date),
    time: formatTimeForSMS(booking.scheduled_time),
  };

  const message =
    type === "day_before"
      ? SMS_TEMPLATES.bookingReminder(templateData)
      : SMS_TEMPLATES.bookingSameDay(templateData);

  return sendAndLogSMS(
    booking.contacts.phone,
    message,
    booking.business_id,
    booking.contacts.id,
    booking.id
  );
}

// Send quote
export async function sendQuoteSMS(quoteId: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select(
      `
      *,
      contacts(id, phone, first_name),
      businesses(id, name)
    `
    )
    .eq("id", quoteId)
    .single();

  if (!quote?.contacts?.phone) return false;

  const quoteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/q/${quote.token}`;

  const templateData: SMSTemplateData = {
    businessName: quote.businesses.name,
    customerName: quote.contacts.first_name,
    total: quote.recommended_price,
    quoteUrl,
  };

  const message = SMS_TEMPLATES.quoteSent(templateData);

  return sendAndLogSMS(
    quote.contacts.phone,
    message,
    quote.business_id,
    quote.contacts.id,
    undefined,
    quote.id
  );
}

// Send quote follow-up
export async function sendQuoteFollowUp(
  quoteId: string,
  dayNumber: 1 | 3 | 5 | 7
): Promise<boolean> {
  const supabase = createAdminClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select(
      `
      *,
      contacts(id, phone, first_name),
      businesses(id, name)
    `
    )
    .eq("id", quoteId)
    .single();

  if (!quote?.contacts?.phone) return false;

  // Don't send if already converted
  if (quote.status === "accepted" || quote.status === "converted") return false;

  const quoteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/q/${quote.token}`;

  const templateData: SMSTemplateData = {
    businessName: quote.businesses.name,
    customerName: quote.contacts.first_name,
    total: quote.recommended_price,
    quoteUrl,
  };

  const templates: Record<number, (data: SMSTemplateData) => string> = {
    1: SMS_TEMPLATES.quoteFollowUp1,
    3: SMS_TEMPLATES.quoteFollowUp3,
    5: SMS_TEMPLATES.quoteFollowUp5,
    7: SMS_TEMPLATES.quoteFollowUp7,
  };

  const message = templates[dayNumber](templateData);

  // Update quote follow-up status
  await supabase
    .from("quotes")
    .update({ [`followup_day${dayNumber}_sent`]: true })
    .eq("id", quoteId);

  return sendAndLogSMS(
    quote.contacts.phone,
    message,
    quote.business_id,
    quote.contacts.id,
    undefined,
    quote.id
  );
}

// Send membership welcome
export async function sendMembershipWelcome(
  membershipId: string
): Promise<boolean> {
  const supabase = createAdminClient();

  const { data: membership } = await supabase
    .from("memberships")
    .select(
      `
      *,
      contacts(id, phone, first_name),
      businesses(id, name, slug)
    `
    )
    .eq("id", membershipId)
    .single();

  if (!membership?.contacts?.phone) return false;

  const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/portal/${membership.businesses.slug}`;

  const templateData: SMSTemplateData = {
    businessName: membership.businesses.name,
    customerName: membership.contacts.first_name,
    date: formatDateForSMS(membership.next_service_date),
    portalUrl,
  };

  const message = SMS_TEMPLATES.membershipWelcome(templateData);

  return sendAndLogSMS(
    membership.contacts.phone,
    message,
    membership.business_id,
    membership.contacts.id
  );
}

// Send payment received notification
export async function sendPaymentReceived(
  bookingId: string,
  amount: number
): Promise<boolean> {
  const supabase = createAdminClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      `
      *,
      contacts(id, phone, first_name),
      businesses(id, name)
    `
    )
    .eq("id", bookingId)
    .single();

  if (!booking?.contacts?.phone) return false;

  const templateData: SMSTemplateData = {
    businessName: booking.businesses.name,
    customerName: booking.contacts.first_name,
    date: formatDateForSMS(booking.scheduled_date),
    deposit: amount,
  };

  const message = SMS_TEMPLATES.paymentReceived(templateData);

  return sendAndLogSMS(
    booking.contacts.phone,
    message,
    booking.business_id,
    booking.contacts.id,
    booking.id
  );
}

// Send booking rescheduled notification
export async function sendBookingRescheduled(
  bookingId: string
): Promise<boolean> {
  const supabase = createAdminClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      `
      *,
      contacts(id, phone, first_name),
      businesses(id, name)
    `
    )
    .eq("id", bookingId)
    .single();

  if (!booking?.contacts?.phone) return false;

  const templateData: SMSTemplateData = {
    businessName: booking.businesses.name,
    customerName: booking.contacts.first_name,
    date: formatDateForSMS(booking.scheduled_date),
    time: formatTimeForSMS(booking.scheduled_time),
  };

  const message = SMS_TEMPLATES.bookingRescheduled(templateData);

  return sendAndLogSMS(
    booking.contacts.phone,
    message,
    booking.business_id,
    booking.contacts.id,
    booking.id
  );
}

// Send booking cancelled notification
export async function sendBookingCancelled(
  bookingId: string
): Promise<boolean> {
  const supabase = createAdminClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      `
      *,
      contacts(id, phone, first_name),
      businesses(id, name)
    `
    )
    .eq("id", bookingId)
    .single();

  if (!booking?.contacts?.phone) return false;

  const templateData: SMSTemplateData = {
    businessName: booking.businesses.name,
    customerName: booking.contacts.first_name,
    date: formatDateForSMS(booking.scheduled_date),
  };

  const message = SMS_TEMPLATES.bookingCancelled(templateData);

  return sendAndLogSMS(
    booking.contacts.phone,
    message,
    booking.business_id,
    booking.contacts.id,
    booking.id
  );
}

// Send on the way notification
export async function sendOnTheWay(bookingId: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      `
      *,
      contacts(id, phone, first_name),
      businesses(id, name)
    `
    )
    .eq("id", bookingId)
    .single();

  if (!booking?.contacts?.phone) return false;

  const templateData: SMSTemplateData = {
    businessName: booking.businesses.name,
    customerName: booking.contacts.first_name,
    time: formatTimeForSMS(booking.scheduled_time),
    address: booking.address,
  };

  const message = SMS_TEMPLATES.onTheWay(templateData);

  return sendAndLogSMS(
    booking.contacts.phone,
    message,
    booking.business_id,
    booking.contacts.id,
    booking.id
  );
}

// Send job completed notification
export async function sendJobCompleted(bookingId: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      `
      *,
      contacts(id, phone, first_name),
      businesses(id, name)
    `
    )
    .eq("id", bookingId)
    .single();

  if (!booking?.contacts?.phone) return false;

  const templateData: SMSTemplateData = {
    businessName: booking.businesses.name,
    customerName: booking.contacts.first_name,
  };

  const message = SMS_TEMPLATES.jobCompleted(templateData);

  return sendAndLogSMS(
    booking.contacts.phone,
    message,
    booking.business_id,
    booking.contacts.id,
    booking.id
  );
}
