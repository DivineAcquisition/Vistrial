// @ts-nocheck
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Confirm booking
export async function confirmBooking(bookingId: string) {
  const admin = createAdminClient();

  const { error } = await admin
    .from("bookings")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", bookingId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/bookings");
  return { success: true };
}

// Cancel booking
export async function cancelBooking(bookingId: string, reason?: string) {
  const admin = createAdminClient();

  const { error } = await admin
    .from("bookings")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      cancellation_reason: reason,
    })
    .eq("id", bookingId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/bookings");
  return { success: true };
}

// Reschedule booking
export async function rescheduleBooking(
  bookingId: string,
  newDate: string,
  newTime: string
) {
  const admin = createAdminClient();

  // Get original for tracking
  const { data: original } = await admin
    .from("bookings")
    .select("scheduled_date, scheduled_time")
    .eq("id", bookingId)
    .single();

  const { error } = await admin
    .from("bookings")
    .update({
      scheduled_date: newDate,
      scheduled_time: newTime,
      rescheduled_from: original
        ? `${original.scheduled_date} ${original.scheduled_time}`
        : null,
      rescheduled_at: new Date().toISOString(),
    })
    .eq("id", bookingId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/bookings");
  return { success: true };
}

// Mark as completed
export async function completeBooking(bookingId: string) {
  const admin = createAdminClient();

  const { error } = await admin
    .from("bookings")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", bookingId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/bookings");
  return { success: true };
}

// Mark as no-show
export async function markNoShow(bookingId: string) {
  const admin = createAdminClient();

  const { error } = await admin
    .from("bookings")
    .update({ status: "no_show" })
    .eq("id", bookingId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/bookings");
  return { success: true };
}

// Add internal note
export async function addBookingNote(bookingId: string, note: string) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("internal_notes")
    .eq("id", bookingId)
    .single();

  const notes = (booking?.internal_notes as any[]) || [];
  notes.push({
    text: note,
    created_by: user.id,
    created_at: new Date().toISOString(),
  });

  const { error } = await supabase
    .from("bookings")
    .update({ internal_notes: notes })
    .eq("id", bookingId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/bookings/${bookingId}`);
  return { success: true };
}

// Create manual booking
export async function createBooking(data: {
  businessId: string;
  contactId: string;
  serviceTypeId: string;
  scheduledDate: string;
  scheduledTime: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  bedrooms: number;
  bathrooms: number;
  hasPets?: boolean;
  total: number;
  customerNotes?: string;
  sendConfirmation?: boolean;
}) {
  const admin = createAdminClient();

  const { data: booking, error } = await admin
    .from("bookings")
    .insert({
      business_id: data.businessId,
      contact_id: data.contactId,
      service_type_id: data.serviceTypeId,
      scheduled_date: data.scheduledDate,
      scheduled_time: data.scheduledTime,
      address_line1: data.address,
      city: data.city,
      state: data.state,
      zip: data.zip,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      has_pets: data.hasPets || false,
      total: data.total,
      customer_notes: data.customerNotes,
      status: "confirmed",
      payment_status: "pending",
      source: "manual",
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/bookings");
  return { success: true, bookingId: booking.id };
}

// Update booking details
export async function updateBooking(
  bookingId: string,
  data: {
    scheduledDate?: string;
    scheduledTime?: string;
    serviceTypeId?: string;
    bedrooms?: number;
    bathrooms?: number;
    hasPets?: boolean;
    total?: number;
    customerNotes?: string;
  }
) {
  const admin = createAdminClient();

  const updateData: Record<string, any> = {};
  if (data.scheduledDate) updateData.scheduled_date = data.scheduledDate;
  if (data.scheduledTime) updateData.scheduled_time = data.scheduledTime;
  if (data.serviceTypeId) updateData.service_type_id = data.serviceTypeId;
  if (data.bedrooms !== undefined) updateData.bedrooms = data.bedrooms;
  if (data.bathrooms !== undefined) updateData.bathrooms = data.bathrooms;
  if (data.hasPets !== undefined) updateData.has_pets = data.hasPets;
  if (data.total !== undefined) updateData.total = data.total;
  if (data.customerNotes !== undefined)
    updateData.customer_notes = data.customerNotes;

  const { error } = await admin
    .from("bookings")
    .update(updateData)
    .eq("id", bookingId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/bookings");
  revalidatePath(`/bookings/${bookingId}`);
  return { success: true };
}
