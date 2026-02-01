"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

// Pause membership
export async function pauseMembershipAction(membershipId: string) {
  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("memberships")
    .select("stripe_subscription_id, business_id")
    .eq("id", membershipId)
    .single();

  if (!membership) {
    return { success: false, error: "Membership not found" };
  }

  // Update DB
  const { error } = await admin
    .from("memberships")
    .update({
      status: "paused",
      paused_at: new Date().toISOString(),
    })
    .eq("id", membershipId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/memberships");
  return { success: true };
}

// Resume membership
export async function resumeMembershipAction(membershipId: string) {
  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("memberships")
    .select("stripe_subscription_id, business_id")
    .eq("id", membershipId)
    .single();

  if (!membership) {
    return { success: false, error: "Membership not found" };
  }

  // Update DB
  const { error } = await admin
    .from("memberships")
    .update({
      status: "active",
      paused_at: null,
    })
    .eq("id", membershipId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/memberships");
  return { success: true };
}

// Cancel membership
export async function cancelMembershipAction(
  membershipId: string,
  reason?: string,
  immediately?: boolean
) {
  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("memberships")
    .select("stripe_subscription_id, business_id")
    .eq("id", membershipId)
    .single();

  if (!membership) {
    return { success: false, error: "Membership not found" };
  }

  // Update DB
  const { error } = await admin
    .from("memberships")
    .update({
      status: immediately ? "canceled" : "canceling",
      canceled_at: new Date().toISOString(),
      cancellation_reason: reason,
    })
    .eq("id", membershipId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/memberships");
  return { success: true };
}

// Update membership schedule
export async function updateMembershipSchedule(
  membershipId: string,
  data: {
    preferredDayOfWeek?: number;
    preferredTime?: string;
    nextServiceDate?: string;
  }
) {
  const admin = createAdminClient();

  const updateData: Record<string, any> = {};
  if (data.preferredDayOfWeek !== undefined)
    updateData.preferred_day_of_week = data.preferredDayOfWeek;
  if (data.preferredTime) updateData.preferred_time = data.preferredTime;
  if (data.nextServiceDate) updateData.next_service_date = data.nextServiceDate;

  const { error } = await admin
    .from("memberships")
    .update(updateData)
    .eq("id", membershipId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/memberships");
  revalidatePath(`/memberships/${membershipId}`);
  return { success: true };
}

// Update membership price
export async function updateMembershipPrice(
  membershipId: string,
  newPrice: number
) {
  const admin = createAdminClient();

  const { error } = await admin
    .from("memberships")
    .update({ price_per_service: newPrice })
    .eq("id", membershipId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/memberships");
  return { success: true };
}

// Create membership
export async function createMembership(data: {
  businessId: string;
  contactId: string;
  serviceTypeId: string;
  frequency: "weekly" | "biweekly" | "monthly";
  pricePerService: number;
  preferredDayOfWeek?: number;
  preferredTime?: string;
  startDate?: string;
}) {
  const admin = createAdminClient();

  const { data: membership, error } = await admin
    .from("memberships")
    .insert({
      business_id: data.businessId,
      contact_id: data.contactId,
      service_type_id: data.serviceTypeId,
      frequency: data.frequency,
      price_per_service: data.pricePerService,
      preferred_day_of_week: data.preferredDayOfWeek,
      preferred_time: data.preferredTime,
      next_service_date: data.startDate || new Date().toISOString().split("T")[0],
      status: "active",
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/memberships");
  return { success: true, membershipId: membership.id };
}
