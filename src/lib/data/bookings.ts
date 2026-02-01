import { createServerSupabaseClient } from "@/lib/supabase/server";

// Types
export interface BookingFilters {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  serviceTypeId?: string;
  page?: number;
  pageSize?: number;
}

export interface BookingWithRelations {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  total: number;
  deposit_paid: boolean;
  payment_status: string;
  address_line1: string;
  city: string;
  bedrooms: number;
  bathrooms: number;
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
  memberships?: {
    id: string;
    frequency: string;
  };
}

// Get paginated bookings list
export async function getBookings(
  businessId: string,
  filters: BookingFilters = {}
) {
  const supabase = await createServerSupabaseClient();

  const {
    status,
    dateFrom,
    dateTo,
    serviceTypeId,
    page = 1,
    pageSize = 25,
  } = filters;

  let query = supabase
    .from("bookings")
    .select(
      `
      *,
      contacts(id, first_name, last_name, phone, email),
      service_types(id, name),
      memberships(id, frequency)
    `,
      { count: "exact" }
    )
    .eq("business_id", businessId)
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true });

  // Apply filters
  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (dateFrom) {
    query = query.gte("scheduled_date", dateFrom);
  }

  if (dateTo) {
    query = query.lte("scheduled_date", dateTo);
  }

  if (serviceTypeId) {
    query = query.eq("service_type_id", serviceTypeId);
  }

  // Pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error("Error fetching bookings:", error);
    return { bookings: [], total: 0, page, totalPages: 0 };
  }

  return {
    bookings: (data || []) as BookingWithRelations[],
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / pageSize),
  };
}

// Get single booking with full details
export async function getBooking(bookingId: string) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      *,
      contacts(*),
      service_types(*),
      memberships(*)
    `
    )
    .eq("id", bookingId)
    .single();

  if (error) {
    console.error("Error fetching booking:", error);
    return null;
  }

  return data;
}

// Get today's bookings
export async function getTodaysBookings(businessId: string) {
  const today = new Date().toISOString().split("T")[0];

  return getBookings(businessId, {
    dateFrom: today,
    dateTo: today,
  });
}

// Get upcoming bookings (next 7 days)
export async function getUpcomingBookings(businessId: string, limit = 10) {
  const supabase = await createServerSupabaseClient();

  const today = new Date().toISOString().split("T")[0];
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);

  const { data } = await supabase
    .from("bookings")
    .select(
      `
      *,
      contacts(id, first_name, last_name, phone),
      service_types(id, name)
    `
    )
    .eq("business_id", businessId)
    .gte("scheduled_date", today)
    .lte("scheduled_date", nextWeek.toISOString().split("T")[0])
    .in("status", ["confirmed", "pending"])
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true })
    .limit(limit);

  return data || [];
}

// Get booking stats
export async function getBookingStats(businessId: string) {
  const supabase = await createServerSupabaseClient();

  const today = new Date().toISOString().split("T")[0];
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date();
  startOfMonth.setDate(1);

  // Today's count
  const { count: todayCount } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("scheduled_date", today)
    .neq("status", "canceled");

  // This week's count
  const { count: weekCount } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .gte("scheduled_date", startOfWeek.toISOString().split("T")[0])
    .lte("scheduled_date", today)
    .neq("status", "canceled");

  // Month revenue
  const { data: monthBookings } = await supabase
    .from("bookings")
    .select("total")
    .eq("business_id", businessId)
    .gte("scheduled_date", startOfMonth.toISOString().split("T")[0])
    .eq("status", "completed");

  const monthRevenue =
    monthBookings?.reduce((sum: number, b: { total?: number }) => sum + (b.total || 0), 0) || 0;

  // Pending count
  const { count: pendingCount } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("status", "pending");

  return {
    today: todayCount || 0,
    thisWeek: weekCount || 0,
    monthRevenue,
    pending: pendingCount || 0,
  };
}

// Get bookings for calendar view
export async function getCalendarBookings(
  businessId: string,
  month: number,
  year: number
) {
  const supabase = await createServerSupabaseClient();

  const startDate = new Date(year, month, 1).toISOString().split("T")[0];
  const endDate = new Date(year, month + 1, 0).toISOString().split("T")[0];

  const { data } = await supabase
    .from("bookings")
    .select(
      `
      id,
      scheduled_date,
      scheduled_time,
      status,
      contacts(first_name, last_name),
      service_types(name)
    `
    )
    .eq("business_id", businessId)
    .gte("scheduled_date", startDate)
    .lte("scheduled_date", endDate)
    .neq("status", "canceled")
    .order("scheduled_time", { ascending: true });

  // Group by date
  const byDate: Record<string, typeof data> = {};
  for (const booking of data || []) {
    const date = booking.scheduled_date;
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(booking);
  }

  return byDate;
}
