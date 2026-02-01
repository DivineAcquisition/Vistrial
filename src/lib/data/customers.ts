import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface CustomerFilters {
  status?: string;
  search?: string;
  hasMembership?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CustomerWithStats {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  status: string;
  source: string;
  created_at: string;
  bookings_count: number;
  total_spent: number;
  memberships: {
    id: string;
    status: string;
    frequency: string;
  }[];
}

// Get paginated customers
export async function getCustomers(
  businessId: string,
  filters: CustomerFilters = {}
) {
  const supabase = await createServerSupabaseClient();

  const { status, search, page = 1, pageSize = 25 } = filters;

  let query = supabase
    .from("contacts")
    .select(
      `
      *,
      memberships(id, status, frequency)
    `,
      { count: "exact" }
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  // Filters
  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
    );
  }

  // Pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error("Error fetching customers:", error);
    return { customers: [], total: 0, page, totalPages: 0 };
  }

  // Get booking stats for each customer
  const customerIds = data?.map((c: { id: string }) => c.id) || [];

  let statsMap: Record<string, { count: number; total: number }> = {};

  if (customerIds.length > 0) {
    const { data: bookingStats } = await supabase
      .from("bookings")
      .select("contact_id, total")
      .in("contact_id", customerIds)
      .eq("status", "completed");

    // Aggregate stats
    for (const b of bookingStats || []) {
      if (!statsMap[b.contact_id]) {
        statsMap[b.contact_id] = { count: 0, total: 0 };
      }
      statsMap[b.contact_id].count++;
      statsMap[b.contact_id].total += b.total || 0;
    }
  }

  const customers = data?.map((c: any) => ({
    ...c,
    bookings_count: statsMap[c.id]?.count || 0,
    total_spent: statsMap[c.id]?.total || 0,
  }));

  return {
    customers: (customers || []) as CustomerWithStats[],
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / pageSize),
  };
}

// Get single customer with full history
export async function getCustomer(customerId: string) {
  const supabase = await createServerSupabaseClient();

  const { data: customer } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", customerId)
    .single();

  if (!customer) return null;

  // Get bookings
  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      `
      *,
      service_types(name)
    `
    )
    .eq("contact_id", customerId)
    .order("scheduled_date", { ascending: false })
    .limit(20);

  // Get memberships
  const { data: memberships } = await supabase
    .from("memberships")
    .select(
      `
      *,
      service_types(name)
    `
    )
    .eq("contact_id", customerId);

  // Get quotes
  const { data: quotes } = await supabase
    .from("quotes")
    .select("*")
    .eq("contact_id", customerId)
    .order("created_at", { ascending: false })
    .limit(10);

  // Get messages
  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("contact_id", customerId)
    .order("created_at", { ascending: false })
    .limit(20);

  // Calculate stats
  const completedBookings =
    bookings?.filter((b: any) => b.status === "completed") || [];
  const totalSpent = completedBookings.reduce(
    (sum: number, b: any) => sum + (b.total || 0),
    0
  );

  return {
    ...customer,
    bookings: bookings || [],
    memberships: memberships || [],
    quotes: quotes || [],
    messages: messages || [],
    stats: {
      totalBookings: bookings?.length || 0,
      completedBookings: completedBookings.length,
      totalSpent,
      activeMemberships:
        memberships?.filter((m: any) => m.status === "active").length || 0,
    },
  };
}

// Get customer stats
export async function getCustomerStats(businessId: string) {
  const supabase = await createServerSupabaseClient();

  // Total customers
  const { count: totalCount } = await supabase
    .from("contacts")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .neq("status", "archived");

  // Active members
  const { count: membersCount } = await supabase
    .from("memberships")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("status", "active");

  // New this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count: newThisMonth } = await supabase
    .from("contacts")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .gte("created_at", startOfMonth.toISOString());

  return {
    total: totalCount || 0,
    activeMembers: membersCount || 0,
    newThisMonth: newThisMonth || 0,
  };
}
