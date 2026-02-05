// @ts-nocheck
import { createServerSupabaseClient } from "@/lib/supabase/server";

// ============================================
// TYPES
// ============================================

export interface CustomerFilters {
  status?: string;
  lifecycleStage?: string;
  tags?: string[];
  search?: string;
  hasMembership?: boolean;
  hasBookedRecently?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
  status: string;
  lifecycle_stage: string;
  source: string | null;

  // Address
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;

  // Property
  property_type: string | null;
  default_bedrooms: number | null;
  default_bathrooms: number | null;
  has_pets: boolean;

  // Stats
  total_bookings: number;
  total_spent: number;
  average_booking_value: number;
  last_booking_at: string | null;

  // Communication
  sms_opted_in: boolean;
  email_opted_in: boolean;
  preferred_contact_method: string;

  // Portal
  portal_enabled: boolean;

  // Timestamps
  created_at: string;
  updated_at: string;

  // Relations
  tags?: { id: string; name: string; color: string }[];
  memberships?: { id: string; status: string; frequency: string }[];
}

export interface CustomerDetail extends Customer {
  // Full address details
  address_line2: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;

  // Property details
  property_sqft: number | null;
  pet_details: string | null;
  parking_instructions: string | null;
  entry_instructions: string | null;
  special_instructions: string | null;

  // Portal
  portal_token: string | null;
  last_portal_login_at: string | null;

  // Source
  source_details: any;

  // Stripe
  stripe_customer_id: string | null;

  // Communication
  last_contact_at: string | null;

  // Business
  business_id: string;

  // Relations
  bookings: any[];
  memberships: any[];
  quotes: any[];
  notes: any[];
  activity: any[];
  addresses: any[];
}

// ============================================
// LIST CUSTOMERS
// ============================================

export async function getCustomers(
  businessId: string,
  filters: CustomerFilters = {}
): Promise<{
  customers: Customer[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const supabase = await createServerSupabaseClient();

  const {
    status,
    lifecycleStage,
    tags,
    search,
    hasMembership,
    hasBookedRecently,
    sortBy = "created_at",
    sortOrder = "desc",
    page = 1,
    pageSize = 25,
  } = filters;

  // Build query
  let query = supabase
    .from("contacts")
    .select(
      `
      *,
      contact_tags(
        customer_tags(id, name, color)
      ),
      memberships(id, status, frequency)
    `,
      { count: "exact" }
    )
    .eq("business_id", businessId)
    .neq("status", "archived");

  // Status filter
  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  // Lifecycle filter
  if (lifecycleStage && lifecycleStage !== "all") {
    query = query.eq("lifecycle_stage", lifecycleStage);
  }

  // Search
  if (search) {
    const searchTerm = `%${search}%`;
    query = query.or(
      `first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},email.ilike.${searchTerm},phone.ilike.${searchTerm}`
    );
  }

  // Recently booked (last 30 days)
  if (hasBookedRecently === true) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    query = query.gte("last_booking_at", thirtyDaysAgo.toISOString());
  }

  // Sorting
  const ascending = sortOrder === "asc";
  query = query.order(sortBy, { ascending });

  // Pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error("Error fetching customers:", error);
    return { customers: [], total: 0, page, totalPages: 0 };
  }

  // Transform data to flatten tags
  const customers = (data || []).map((c: any) => ({
    ...c,
    tags:
      c.contact_tags?.map((ct: any) => ct.customer_tags).filter(Boolean) || [],
    memberships: c.memberships || [],
  }));

  // Filter by tags if specified (post-query for simplicity)
  let filteredCustomers = customers;
  if (tags && tags.length > 0) {
    filteredCustomers = customers.filter((c: any) =>
      c.tags.some((t: any) => tags.includes(t.id))
    );
  }

  // Filter by membership if specified
  if (hasMembership === true) {
    filteredCustomers = filteredCustomers.filter(
      (c: any) => c.memberships && c.memberships.length > 0
    );
  }

  return {
    customers: filteredCustomers,
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / pageSize),
  };
}

// ============================================
// GET SINGLE CUSTOMER
// ============================================

export async function getCustomer(
  customerId: string
): Promise<CustomerDetail | null> {
  const supabase = await createServerSupabaseClient();

  // Get customer
  const { data: customer, error } = await supabase
    .from("contacts")
    .select(
      `
      *,
      contact_tags(
        customer_tags(id, name, color)
      )
    `
    )
    .eq("id", customerId)
    .single();

  if (error || !customer) {
    console.error("Error fetching customer:", error);
    return null;
  }

  // Get related data in parallel
  const [bookings, memberships, quotes, notes, activity, addresses] =
    await Promise.all([
      // Bookings
      supabase
        .from("bookings")
        .select(
          `
          *,
          service_types(name)
        `
        )
        .eq("contact_id", customerId)
        .order("scheduled_date", { ascending: false })
        .limit(50),

      // Memberships
      supabase
        .from("memberships")
        .select(
          `
          *,
          service_types(name)
        `
        )
        .eq("contact_id", customerId)
        .order("created_at", { ascending: false }),

      // Quotes
      supabase
        .from("quotes")
        .select("*")
        .eq("contact_id", customerId)
        .order("created_at", { ascending: false })
        .limit(20),

      // Notes
      supabase
        .from("customer_notes")
        .select("*")
        .eq("contact_id", customerId)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50),

      // Activity
      supabase
        .from("customer_activity")
        .select("*")
        .eq("contact_id", customerId)
        .order("created_at", { ascending: false })
        .limit(100),

      // Addresses
      supabase
        .from("customer_addresses")
        .select("*")
        .eq("contact_id", customerId)
        .order("is_default", { ascending: false }),
    ]);

  return {
    ...customer,
    tags:
      customer.contact_tags
        ?.map((ct: any) => ct.customer_tags)
        .filter(Boolean) || [],
    bookings: bookings.data || [],
    memberships: memberships.data || [],
    quotes: quotes.data || [],
    notes: notes.data || [],
    activity: activity.data || [],
    addresses: addresses.data || [],
  };
}

// ============================================
// CUSTOMER STATS
// ============================================

export async function getCustomerStats(businessId: string) {
  const supabase = await createServerSupabaseClient();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Run all queries in parallel
  const [
    totalResult,
    leadsResult,
    customersResult,
    membersResult,
    newThisMonthResult,
    activeResult,
    atRiskResult,
  ] = await Promise.all([
    // Total (non-archived)
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("business_id", businessId)
      .neq("status", "archived"),

    // Leads
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("status", "lead"),

    // Customers (have booked)
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("status", "customer"),

    // Active members
    supabase
      .from("memberships")
      .select("*", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("status", "active"),

    // New this month
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("created_at", startOfMonth.toISOString()),

    // Active (booked in last 30 days)
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("last_booking_at", thirtyDaysAgo.toISOString()),

    // At risk (loyal but no booking in 60+ days)
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("lifecycle_stage", "loyal")
      .lt(
        "last_booking_at",
        new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString()
      ),
  ]);

  // Calculate total LTV
  const { data: ltvData } = await supabase
    .from("contacts")
    .select("total_spent")
    .eq("business_id", businessId)
    .neq("status", "archived");

  const totalLTV =
    ltvData?.reduce((sum: number, c: any) => sum + (c.total_spent || 0), 0) || 0;
  const avgLTV = ltvData?.length ? totalLTV / ltvData.length : 0;

  return {
    total: totalResult.count || 0,
    leads: leadsResult.count || 0,
    customers: customersResult.count || 0,
    members: membersResult.count || 0,
    newThisMonth: newThisMonthResult.count || 0,
    activeRecently: activeResult.count || 0,
    atRisk: atRiskResult.count || 0,
    totalLTV,
    averageLTV: Math.round(avgLTV),
  };
}

// ============================================
// CUSTOMER SEARCH (Quick search)
// ============================================

export async function searchCustomers(
  businessId: string,
  query: string,
  limit = 10
) {
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, phone, email, status")
    .eq("business_id", businessId)
    .neq("status", "archived")
    .or(
      `first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`
    )
    .limit(limit);

  return data || [];
}

// ============================================
// GET TAGS
// ============================================

export async function getCustomerTags(businessId: string) {
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("customer_tags")
    .select("*")
    .eq("business_id", businessId)
    .order("name");

  return data || [];
}

// ============================================
// GET CUSTOMER ACTIVITY
// ============================================

export async function getCustomerActivity(
  customerId: string,
  limit = 50,
  offset = 0
) {
  const supabase = await createServerSupabaseClient();

  const { data, count } = await supabase
    .from("customer_activity")
    .select("*", { count: "exact" })
    .eq("contact_id", customerId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  return {
    activities: data || [],
    total: count || 0,
  };
}

// ============================================
// CHECK FOR DUPLICATES
// ============================================

export async function findDuplicateCustomers(
  businessId: string,
  phone?: string,
  email?: string
) {
  const supabase = await createServerSupabaseClient();

  const conditions = [];
  if (phone) {
    const cleanPhone = phone.replace(/\D/g, "");
    conditions.push(`phone.eq.${cleanPhone}`);
  }
  if (email) {
    conditions.push(`email.ilike.${email}`);
  }

  if (conditions.length === 0) return [];

  const { data } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, phone, email")
    .eq("business_id", businessId)
    .neq("status", "archived")
    .or(conditions.join(","));

  return data || [];
}
