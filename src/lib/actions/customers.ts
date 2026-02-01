"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

// Create customer
export async function createCustomer(data: {
  businessId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  notes?: string;
  source?: string;
}) {
  const admin = createAdminClient();

  // Check for duplicate by phone
  const cleanPhone = data.phone.replace(/\D/g, "");

  const { data: existing } = await admin
    .from("contacts")
    .select("id")
    .eq("business_id", data.businessId)
    .eq("phone", cleanPhone)
    .maybeSingle();

  if (existing) {
    return {
      success: false,
      error: "Customer with this phone already exists",
      existingId: existing.id,
    };
  }

  const { data: customer, error } = await admin
    .from("contacts")
    .insert({
      business_id: data.businessId,
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
      phone: cleanPhone,
      address_line1: data.address,
      city: data.city,
      state: data.state,
      zip: data.zip,
      notes: data.notes,
      source: data.source || "manual",
      status: "lead",
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/customers");
  return { success: true, customerId: customer.id };
}

// Update customer
export async function updateCustomer(
  customerId: string,
  data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    notes?: string;
    status?: string;
  }
) {
  const admin = createAdminClient();

  const updateData: Record<string, any> = {};
  if (data.firstName) updateData.first_name = data.firstName;
  if (data.lastName) updateData.last_name = data.lastName;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.phone) updateData.phone = data.phone.replace(/\D/g, "");
  if (data.address !== undefined) updateData.address_line1 = data.address;
  if (data.city !== undefined) updateData.city = data.city;
  if (data.state !== undefined) updateData.state = data.state;
  if (data.zip !== undefined) updateData.zip = data.zip;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.status) updateData.status = data.status;

  const { error } = await admin
    .from("contacts")
    .update(updateData)
    .eq("id", customerId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}

// Archive customer
export async function archiveCustomer(customerId: string) {
  const admin = createAdminClient();

  const { error } = await admin
    .from("contacts")
    .update({ status: "archived" })
    .eq("id", customerId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/customers");
  return { success: true };
}

// Merge customers
export async function mergeCustomers(primaryId: string, duplicateId: string) {
  const admin = createAdminClient();

  // Move all related records
  await admin
    .from("bookings")
    .update({ contact_id: primaryId })
    .eq("contact_id", duplicateId);

  await admin
    .from("memberships")
    .update({ contact_id: primaryId })
    .eq("contact_id", duplicateId);

  await admin
    .from("quotes")
    .update({ contact_id: primaryId })
    .eq("contact_id", duplicateId);

  await admin
    .from("messages")
    .update({ contact_id: primaryId })
    .eq("contact_id", duplicateId);

  // Delete duplicate
  await admin.from("contacts").delete().eq("id", duplicateId);

  revalidatePath("/customers");
  return { success: true };
}

// Send SMS to customer
export async function sendCustomerSMS(customerId: string, message: string) {
  const admin = createAdminClient();

  const { data: contact } = await admin
    .from("contacts")
    .select("phone, business_id")
    .eq("id", customerId)
    .single();

  if (!contact?.phone) {
    return { success: false, error: "No phone number" };
  }

  // Get business Twilio credentials
  const { data: business } = await admin
    .from("businesses")
    .select("twilio_account_sid, twilio_auth_token, twilio_phone_number")
    .eq("id", contact.business_id)
    .single();

  if (!business?.twilio_account_sid || !business?.twilio_auth_token || !business?.twilio_phone_number) {
    return { success: false, error: "Twilio not configured for this business" };
  }

  try {
    const { sendSMS } = await import("@/lib/twilio/send-sms");
    
    const result = await sendSMS({
      to: contact.phone,
      from: business.twilio_phone_number,
      body: message,
      accountSid: business.twilio_account_sid,
      authToken: business.twilio_auth_token,
    });

    // Log the message
    if (result.success) {
      await admin.from("messages").insert({
        business_id: contact.business_id,
        contact_id: customerId,
        direction: "outbound",
        channel: "sms",
        body: message,
        status: result.status || "sent",
        twilio_sid: result.messageSid,
      });
    }

    return result;
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to send SMS" };
  }
}
