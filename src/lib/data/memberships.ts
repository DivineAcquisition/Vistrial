// @ts-nocheck
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface MembershipFilters {
  status?: string;
  frequency?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface MembershipWithRelations {
  id: string;
  status: string;
  frequency: string;
  price_per_service: number;
  next_service_date: string;
  preferred_day_of_week: number;
  preferred_time: string;
  created_at: string;
  contacts: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
  };
  service_types: {
    id: string;
    name: string;
  };
}

// Get paginated memberships
export async function getMemberships(
  businessId: string,
  filters: MembershipFilters = {}
) {
  const supabase = await createServerSupabaseClient();

  const { status, frequency, page = 1, pageSize = 25 } = filters;

  let query = supabase
    .from("memberships")
    .select(
      `
      *,
      contacts(id, first_name, last_name, phone, email),
      service_types(id, name)
    `,
      { count: "exact" }
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (frequency && frequency !== "all") {
    query = query.eq("frequency", frequency);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error("Error fetching memberships:", error);
    return { memberships: [], total: 0, page, totalPages: 0 };
  }

  return {
    memberships: (data || []) as MembershipWithRelations[],
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / pageSize),
  };
}

// Get single membership
export async function getMembership(membershipId: string) {
  const supabase = await createServerSupabaseClient();

  const { data: membership } = await supabase
    .from("memberships")
    .select(
      `
      *,
      contacts(*),
      service_types(*)
    `
    )
    .eq("id", membershipId)
    .single();

  if (!membership) return null;

  // Get related bookings
  const { data: bookings } = await supabase
    .from("bookings")
    .select("*")
    .eq("membership_id", membershipId)
    .order("scheduled_date", { ascending: false })
    .limit(20);

  // Get payment history
  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("membership_id", membershipId)
    .order("created_at", { ascending: false });

  return {
    ...membership,
    bookings: bookings || [],
    payments: payments || [],
  };
}

// Get membership stats
export async function getMembershipStats(businessId: string) {
  const supabase = await createServerSupabaseClient();

  // Active count
  const { count: activeCount } = await supabase
    .from("memberships")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("status", "active");

  // Paused count
  const { count: pausedCount } = await supabase
    .from("memberships")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("status", "paused");

  // Past due count
  const { count: pastDueCount } = await supabase
    .from("memberships")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("status", "past_due");

  // Calculate MRR
  const { data: activeMemberships } = await supabase
    .from("memberships")
    .select("price_per_service, frequency")
    .eq("business_id", businessId)
    .eq("status", "active");

  let mrr = 0;
  for (const m of activeMemberships || []) {
    const multiplier: Record<string, number> = {
      weekly: 4.33,
      biweekly: 2.17,
      monthly: 1,
    };
    mrr += (m.price_per_service || 0) * (multiplier[m.frequency] || 1);
  }

  // Churn this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);

  const { count: churnedCount } = await supabase
    .from("memberships")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("status", "canceled")
    .gte("canceled_at", startOfMonth.toISOString());

  return {
    active: activeCount || 0,
    paused: pausedCount || 0,
    pastDue: pastDueCount || 0,
    mrr: Math.round(mrr),
    churnedThisMonth: churnedCount || 0,
  };
}
