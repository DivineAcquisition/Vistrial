"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================
// CREATE CUSTOMER
// ============================================

export async function createCustomer(data: {
  businessId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;

  // Address
  address?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;

  // Property
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  hasPets?: boolean;
  petDetails?: string;

  // Access
  entryInstructions?: string;
  parkingInstructions?: string;
  specialInstructions?: string;

  // Meta
  source?: string;
  notes?: string;
  tags?: string[];
}) {
  const admin = createAdminClient();

  // Clean phone number
  const cleanPhone = data.phone.replace(/\D/g, "");

  // Check for duplicate
  const { data: existing } = await admin
    .from("contacts")
    .select("id, first_name, last_name")
    .eq("business_id", data.businessId)
    .eq("phone", cleanPhone)
    .maybeSingle();

  if (existing) {
    return {
      success: false,
      error: `Customer already exists: ${existing.first_name} ${existing.last_name}`,
      existingId: existing.id,
    };
  }

  // Create customer
  const { data: customer, error } = await admin
    .from("contacts")
    .insert({
      business_id: data.businessId,
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email || null,
      phone: cleanPhone,

      // Address
      address_line1: data.address || null,
      address_line2: data.addressLine2 || null,
      city: data.city || null,
      state: data.state || null,
      zip: data.zip || null,

      // Property
      property_type: data.propertyType || null,
      default_bedrooms: data.bedrooms || null,
      default_bathrooms: data.bathrooms || null,
      property_sqft: data.sqft || null,
      has_pets: data.hasPets || false,
      pet_details: data.petDetails || null,

      // Access
      entry_instructions: data.entryInstructions || null,
      parking_instructions: data.parkingInstructions || null,
      special_instructions: data.specialInstructions || null,

      // Meta
      source: data.source || "manual",
      status: "lead",
      lifecycle_stage: "new",
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating customer:", error);
    return { success: false, error: error.message };
  }

  // Add initial note if provided
  if (data.notes) {
    await admin.from("customer_notes").insert({
      contact_id: customer.id,
      business_id: data.businessId,
      note_type: "general",
      content: data.notes,
    });
  }

  // Add tags if provided
  if (data.tags && data.tags.length > 0) {
    await admin.from("contact_tags").insert(
      data.tags.map((tagId) => ({
        contact_id: customer.id,
        tag_id: tagId,
      }))
    );
  }

  // Log activity
  await admin.from("customer_activity").insert({
    contact_id: customer.id,
    business_id: data.businessId,
    activity_type: "customer_created",
    title: "Customer created",
    description: `Added via ${data.source || "manual entry"}`,
  });

  revalidatePath("/customers");
  return { success: true, customerId: customer.id };
}

// ============================================
// UPDATE CUSTOMER
// ============================================

export async function updateCustomer(
  customerId: string,
  data: Partial<{
    firstName: string;
    lastName: string;
    email: string;
    phone: string;

    address: string;
    addressLine2: string;
    city: string;
    state: string;
    zip: string;

    propertyType: string;
    bedrooms: number;
    bathrooms: number;
    sqft: number;
    hasPets: boolean;
    petDetails: string;

    entryInstructions: string;
    parkingInstructions: string;
    specialInstructions: string;

    status: string;
    preferredContactMethod: string;
    smsOptedIn: boolean;
    emailOptedIn: boolean;
    portalEnabled: boolean;
  }>
) {
  const admin = createAdminClient();

  // Build update object
  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (data.firstName !== undefined) updateData.first_name = data.firstName;
  if (data.lastName !== undefined) updateData.last_name = data.lastName;
  if (data.email !== undefined) updateData.email = data.email || null;
  if (data.phone !== undefined)
    updateData.phone = data.phone.replace(/\D/g, "");

  if (data.address !== undefined) updateData.address_line1 = data.address;
  if (data.addressLine2 !== undefined)
    updateData.address_line2 = data.addressLine2;
  if (data.city !== undefined) updateData.city = data.city;
  if (data.state !== undefined) updateData.state = data.state;
  if (data.zip !== undefined) updateData.zip = data.zip;

  if (data.propertyType !== undefined)
    updateData.property_type = data.propertyType;
  if (data.bedrooms !== undefined) updateData.default_bedrooms = data.bedrooms;
  if (data.bathrooms !== undefined)
    updateData.default_bathrooms = data.bathrooms;
  if (data.sqft !== undefined) updateData.property_sqft = data.sqft;
  if (data.hasPets !== undefined) updateData.has_pets = data.hasPets;
  if (data.petDetails !== undefined) updateData.pet_details = data.petDetails;

  if (data.entryInstructions !== undefined)
    updateData.entry_instructions = data.entryInstructions;
  if (data.parkingInstructions !== undefined)
    updateData.parking_instructions = data.parkingInstructions;
  if (data.specialInstructions !== undefined)
    updateData.special_instructions = data.specialInstructions;

  if (data.status !== undefined) updateData.status = data.status;
  if (data.preferredContactMethod !== undefined)
    updateData.preferred_contact_method = data.preferredContactMethod;
  if (data.smsOptedIn !== undefined) {
    updateData.sms_opted_in = data.smsOptedIn;
    if (!data.smsOptedIn)
      updateData.sms_opted_out_at = new Date().toISOString();
  }
  if (data.emailOptedIn !== undefined) {
    updateData.email_opted_in = data.emailOptedIn;
    if (!data.emailOptedIn)
      updateData.email_opted_out_at = new Date().toISOString();
  }
  if (data.portalEnabled !== undefined)
    updateData.portal_enabled = data.portalEnabled;

  const { error } = await admin
    .from("contacts")
    .update(updateData)
    .eq("id", customerId);

  if (error) {
    console.error("Error updating customer:", error);
    return { success: false, error: error.message };
  }

  // Log activity
  const { data: customer } = await admin
    .from("contacts")
    .select("business_id")
    .eq("id", customerId)
    .single();

  if (customer) {
    await admin.from("customer_activity").insert({
      contact_id: customerId,
      business_id: customer.business_id,
      activity_type: "customer_updated",
      title: "Customer updated",
      metadata: { updated_fields: Object.keys(data) },
    });
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}

// ============================================
// ARCHIVE CUSTOMER
// ============================================

export async function archiveCustomer(customerId: string) {
  const admin = createAdminClient();

  const { data: customer } = await admin
    .from("contacts")
    .select("business_id")
    .eq("id", customerId)
    .single();

  const { error } = await admin
    .from("contacts")
    .update({
      status: "archived",
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId);

  if (error) {
    return { success: false, error: error.message };
  }

  // Log activity
  if (customer) {
    await admin.from("customer_activity").insert({
      contact_id: customerId,
      business_id: customer.business_id,
      activity_type: "customer_archived",
      title: "Customer archived",
    });
  }

  revalidatePath("/customers");
  return { success: true };
}

// ============================================
// RESTORE CUSTOMER
// ============================================

export async function restoreCustomer(customerId: string) {
  const admin = createAdminClient();

  const { error } = await admin
    .from("contacts")
    .update({
      status: "customer",
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/customers");
  return { success: true };
}

// ============================================
// MERGE CUSTOMERS
// ============================================

export async function mergeCustomers(
  primaryId: string,
  duplicateId: string,
  keepFields?: Record<string, "primary" | "duplicate">
) {
  const admin = createAdminClient();

  // Get both customers
  const [{ data: primary }, { data: duplicate }] = await Promise.all([
    admin.from("contacts").select("*").eq("id", primaryId).single(),
    admin.from("contacts").select("*").eq("id", duplicateId).single(),
  ]);

  if (!primary || !duplicate) {
    return { success: false, error: "Customer not found" };
  }

  // Merge fields if specified
  if (keepFields) {
    const updateData: Record<string, any> = {};
    for (const [field, source] of Object.entries(keepFields)) {
      if (source === "duplicate") {
        updateData[field] = (duplicate as any)[field];
      }
    }
    if (Object.keys(updateData).length > 0) {
      await admin.from("contacts").update(updateData).eq("id", primaryId);
    }
  }

  // Move all related records
  await Promise.all([
    admin
      .from("bookings")
      .update({ contact_id: primaryId })
      .eq("contact_id", duplicateId),
    admin
      .from("memberships")
      .update({ contact_id: primaryId })
      .eq("contact_id", duplicateId),
    admin
      .from("quotes")
      .update({ contact_id: primaryId })
      .eq("contact_id", duplicateId),
    admin
      .from("messages")
      .update({ contact_id: primaryId })
      .eq("contact_id", duplicateId),
    admin
      .from("customer_notes")
      .update({ contact_id: primaryId })
      .eq("contact_id", duplicateId),
    admin
      .from("customer_activity")
      .update({ contact_id: primaryId })
      .eq("contact_id", duplicateId),
    admin
      .from("customer_addresses")
      .update({ contact_id: primaryId })
      .eq("contact_id", duplicateId),
  ]);

  // Move tags (avoid duplicates)
  const { data: duplicateTags } = await admin
    .from("contact_tags")
    .select("tag_id")
    .eq("contact_id", duplicateId);

  const { data: primaryTags } = await admin
    .from("contact_tags")
    .select("tag_id")
    .eq("contact_id", primaryId);

  const primaryTagIds = new Set(primaryTags?.map((t) => t.tag_id));
  const newTags =
    duplicateTags?.filter((t) => !primaryTagIds.has(t.tag_id)) || [];

  if (newTags.length > 0) {
    await admin
      .from("contact_tags")
      .insert(newTags.map((t) => ({ contact_id: primaryId, tag_id: t.tag_id })));
  }

  // Delete duplicate contact tags
  await admin.from("contact_tags").delete().eq("contact_id", duplicateId);

  // Delete duplicate
  await admin.from("contacts").delete().eq("id", duplicateId);

  // Log activity
  await admin.from("customer_activity").insert({
    contact_id: primaryId,
    business_id: primary.business_id,
    activity_type: "customers_merged",
    title: "Merged with duplicate customer",
    metadata: { merged_from: duplicateId },
  });

  revalidatePath("/customers");
  return { success: true };
}

// ============================================
// ADD NOTE
// ============================================

export async function addCustomerNote(data: {
  customerId: string;
  businessId: string;
  content: string;
  noteType?: string;
  isPinned?: boolean;
}) {
  const supabase = await createServerSupabaseClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: note, error } = await admin
    .from("customer_notes")
    .insert({
      contact_id: data.customerId,
      business_id: data.businessId,
      created_by: user?.id,
      content: data.content,
      note_type: data.noteType || "general",
      is_pinned: data.isPinned || false,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  // Log activity
  await admin.from("customer_activity").insert({
    contact_id: data.customerId,
    business_id: data.businessId,
    activity_type: "note_added",
    title: `Note added: ${data.noteType || "general"}`,
    description: data.content.substring(0, 100),
  });

  revalidatePath(`/customers/${data.customerId}`);
  return { success: true, noteId: note.id };
}

// ============================================
// UPDATE NOTE
// ============================================

export async function updateCustomerNote(
  noteId: string,
  data: { content?: string; isPinned?: boolean }
) {
  const admin = createAdminClient();

  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (data.content !== undefined) updateData.content = data.content;
  if (data.isPinned !== undefined) updateData.is_pinned = data.isPinned;

  const { error } = await admin
    .from("customer_notes")
    .update(updateData)
    .eq("id", noteId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/customers");
  return { success: true };
}

// ============================================
// DELETE NOTE
// ============================================

export async function deleteCustomerNote(noteId: string) {
  const admin = createAdminClient();

  const { error } = await admin.from("customer_notes").delete().eq("id", noteId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/customers");
  return { success: true };
}

// ============================================
// MANAGE TAGS
// ============================================

export async function addTagToCustomer(customerId: string, tagId: string) {
  const admin = createAdminClient();

  const { error } = await admin
    .from("contact_tags")
    .insert({ contact_id: customerId, tag_id: tagId });

  if (error && !error.message.includes("duplicate")) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}

export async function removeTagFromCustomer(customerId: string, tagId: string) {
  const admin = createAdminClient();

  const { error } = await admin
    .from("contact_tags")
    .delete()
    .eq("contact_id", customerId)
    .eq("tag_id", tagId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}

export async function createTag(data: {
  businessId: string;
  name: string;
  color?: string;
  description?: string;
}) {
  const admin = createAdminClient();

  const { data: tag, error } = await admin
    .from("customer_tags")
    .insert({
      business_id: data.businessId,
      name: data.name,
      color: data.color || "#6366f1",
      description: data.description,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/customers");
  return { success: true, tagId: tag.id };
}

export async function deleteTag(tagId: string) {
  const admin = createAdminClient();

  // This will cascade delete contact_tags
  const { error } = await admin.from("customer_tags").delete().eq("id", tagId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/customers");
  return { success: true };
}

// ============================================
// CUSTOMER ADDRESSES
// ============================================

export async function addCustomerAddress(data: {
  customerId: string;
  label?: string;
  isDefault?: boolean;
  address: string;
  addressLine2?: string;
  city: string;
  state: string;
  zip: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  hasPets?: boolean;
  petDetails?: string;
  entryInstructions?: string;
  parkingInstructions?: string;
  gateCode?: string;
}) {
  const admin = createAdminClient();

  // If setting as default, unset other defaults
  if (data.isDefault) {
    await admin
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("contact_id", data.customerId);
  }

  const { data: address, error } = await admin
    .from("customer_addresses")
    .insert({
      contact_id: data.customerId,
      label: data.label,
      is_default: data.isDefault || false,
      address_line1: data.address,
      address_line2: data.addressLine2,
      city: data.city,
      state: data.state,
      zip: data.zip,
      property_type: data.propertyType,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      sqft: data.sqft,
      has_pets: data.hasPets,
      pet_details: data.petDetails,
      entry_instructions: data.entryInstructions,
      parking_instructions: data.parkingInstructions,
      gate_code: data.gateCode,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/customers/${data.customerId}`);
  return { success: true, addressId: address.id };
}

export async function updateCustomerAddress(
  addressId: string,
  data: Partial<{
    label: string;
    isDefault: boolean;
    address: string;
    addressLine2: string;
    city: string;
    state: string;
    zip: string;
    propertyType: string;
    bedrooms: number;
    bathrooms: number;
    sqft: number;
    hasPets: boolean;
    petDetails: string;
    entryInstructions: string;
    parkingInstructions: string;
    gateCode: string;
  }>
) {
  const admin = createAdminClient();

  // Get address to find contact_id
  const { data: existing } = await admin
    .from("customer_addresses")
    .select("contact_id")
    .eq("id", addressId)
    .single();

  // If setting as default, unset other defaults
  if (data.isDefault && existing) {
    await admin
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("contact_id", existing.contact_id);
  }

  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (data.label !== undefined) updateData.label = data.label;
  if (data.isDefault !== undefined) updateData.is_default = data.isDefault;
  if (data.address !== undefined) updateData.address_line1 = data.address;
  if (data.addressLine2 !== undefined)
    updateData.address_line2 = data.addressLine2;
  if (data.city !== undefined) updateData.city = data.city;
  if (data.state !== undefined) updateData.state = data.state;
  if (data.zip !== undefined) updateData.zip = data.zip;
  if (data.propertyType !== undefined)
    updateData.property_type = data.propertyType;
  if (data.bedrooms !== undefined) updateData.bedrooms = data.bedrooms;
  if (data.bathrooms !== undefined) updateData.bathrooms = data.bathrooms;
  if (data.sqft !== undefined) updateData.sqft = data.sqft;
  if (data.hasPets !== undefined) updateData.has_pets = data.hasPets;
  if (data.petDetails !== undefined) updateData.pet_details = data.petDetails;
  if (data.entryInstructions !== undefined)
    updateData.entry_instructions = data.entryInstructions;
  if (data.parkingInstructions !== undefined)
    updateData.parking_instructions = data.parkingInstructions;
  if (data.gateCode !== undefined) updateData.gate_code = data.gateCode;

  const { error } = await admin
    .from("customer_addresses")
    .update(updateData)
    .eq("id", addressId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/customers");
  return { success: true };
}

export async function deleteCustomerAddress(addressId: string) {
  const admin = createAdminClient();

  const { error } = await admin
    .from("customer_addresses")
    .delete()
    .eq("id", addressId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/customers");
  return { success: true };
}

// ============================================
// CUSTOMER PORTAL
// ============================================

export async function enableCustomerPortal(customerId: string) {
  const admin = createAdminClient();

  // Generate portal token
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // Token valid for 30 days

  const { error } = await admin
    .from("contacts")
    .update({
      portal_enabled: true,
      portal_token: token,
      portal_token_expires_at: expiresAt.toISOString(),
    })
    .eq("id", customerId);

  if (error) {
    return { success: false, error: error.message };
  }

  // Generate portal URL
  const { data: customer } = await admin
    .from("contacts")
    .select("business_id, businesses(slug)")
    .eq("id", customerId)
    .single();

  const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/portal/${(customer?.businesses as any)?.slug}?token=${token}`;

  revalidatePath(`/customers/${customerId}`);
  return { success: true, portalUrl, token };
}

export async function disableCustomerPortal(customerId: string) {
  const admin = createAdminClient();

  const { error } = await admin
    .from("contacts")
    .update({
      portal_enabled: false,
      portal_token: null,
      portal_token_expires_at: null,
    })
    .eq("id", customerId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}

export async function regeneratePortalToken(customerId: string) {
  return enableCustomerPortal(customerId);
}

// ============================================
// SEND SMS TO CUSTOMER
// ============================================

export async function sendCustomerSMS(customerId: string, message: string) {
  const admin = createAdminClient();

  const { data: customer } = await admin
    .from("contacts")
    .select("phone, business_id, sms_opted_in, first_name")
    .eq("id", customerId)
    .single();

  if (!customer) {
    return { success: false, error: "Customer not found" };
  }

  if (!customer.phone) {
    return { success: false, error: "Customer has no phone number" };
  }

  if (!customer.sms_opted_in) {
    return { success: false, error: "Customer has opted out of SMS" };
  }

  // Get business Twilio credentials
  const { data: business } = await admin
    .from("businesses")
    .select("twilio_account_sid, twilio_auth_token, twilio_phone_number")
    .eq("id", customer.business_id)
    .single();

  if (
    !business?.twilio_account_sid ||
    !business?.twilio_auth_token ||
    !business?.twilio_phone_number
  ) {
    return { success: false, error: "Twilio not configured for this business" };
  }

  try {
    const { sendSMS } = await import("@/lib/twilio/send-sms");

    const result = await sendSMS({
      to: customer.phone,
      from: business.twilio_phone_number,
      body: message,
      accountSid: business.twilio_account_sid,
      authToken: business.twilio_auth_token,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Log activity
    await admin.from("customer_activity").insert({
      contact_id: customerId,
      business_id: customer.business_id,
      activity_type: "message_sent",
      title: "SMS sent",
      description: message.substring(0, 100),
    });

    // Also log message
    await admin.from("messages").insert({
      business_id: customer.business_id,
      contact_id: customerId,
      direction: "outbound",
      channel: "sms",
      body: message,
      status: "sent",
      external_id: result.messageSid,
      message_type: "manual",
    });

    revalidatePath(`/customers/${customerId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to send SMS" };
  }
}

// ============================================
// BULK ACTIONS
// ============================================

export async function bulkAddTag(customerIds: string[], tagId: string) {
  const admin = createAdminClient();

  const inserts = customerIds.map((id) => ({
    contact_id: id,
    tag_id: tagId,
  }));

  const { error } = await admin
    .from("contact_tags")
    .upsert(inserts, { onConflict: "contact_id,tag_id" });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/customers");
  return { success: true, count: customerIds.length };
}

export async function bulkArchive(customerIds: string[]) {
  const admin = createAdminClient();

  const { error } = await admin
    .from("contacts")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .in("id", customerIds);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/customers");
  return { success: true, count: customerIds.length };
}

export async function bulkExport(
  businessId: string,
  filters?: { status?: string }
) {
  const admin = createAdminClient();

  let query = admin
    .from("contacts")
    .select("*")
    .eq("business_id", businessId)
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data } = await query;

  // Format for CSV
  const csvData = (data || []).map((c: any) => ({
    first_name: c.first_name,
    last_name: c.last_name,
    email: c.email,
    phone: c.phone,
    address: c.address_line1,
    city: c.city,
    state: c.state,
    zip: c.zip,
    status: c.status,
    total_bookings: c.total_bookings,
    total_spent: c.total_spent,
    created_at: c.created_at,
  }));

  return { success: true, data: csvData };
}
