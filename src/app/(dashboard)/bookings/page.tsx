import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { BookingsList } from "@/components/bookings/bookings-list";
import { BookingsHeader } from "@/components/bookings/bookings-header";
import { BookingsFilters } from "@/components/bookings/bookings-filters";

export const dynamic = "force-dynamic";

interface BookingsPageProps {
  searchParams: Promise<{
    status?: string;
    date?: string;
    search?: string;
    page?: string;
  }>;
}

export default async function BookingsPage({ searchParams }: BookingsPageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Get business
  let business = null;
  const { data: businessData } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", user.id)
    .single();

  if (businessData) {
    business = businessData;
  } else {
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profile) {
      business = {
        id: profile.id,
        name: profile.business_name || "My Business",
        slug: profile.business_slug || "my-business",
      };
    }
  }

  if (!business) redirect("/onboarding");

  const today = new Date().toISOString().split("T")[0];

  // Build query for bookings list
  let bookings: Array<{
    id: string;
    scheduled_date: string;
    scheduled_time: string;
    status: string;
    total: number;
    address_line1: string;
    city: string;
    state: string;
    contacts: {
      first_name: string;
      last_name: string;
      phone: string;
      email: string;
    };
    service_types: {
      name: string;
    };
    memberships?: {
      frequency: string;
    };
  }> = [];
  let count = 0;

  try {
    let query = supabase
      .from("bookings")
      .select(
        `
        *,
        contacts(first_name, last_name, phone, email),
        service_types(name),
        memberships(frequency)
      `,
        { count: "exact" }
      )
      .eq("business_id", business.id)
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true });

    // Apply filters
    if (params.status && params.status !== "all") {
      query = query.eq("status", params.status);
    }

    if (params.date) {
      query = query.eq("scheduled_date", params.date);
    }

    // Note: Search on related tables is complex in Supabase
    // For now, we'll filter on the main table fields
    if (params.search) {
      query = query.ilike("address_line1", `%${params.search}%`);
    }

    // Pagination
    const page = parseInt(params.page || "1", 10);
    const pageSize = 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    query = query.range(from, to);

    const result = await query;
    bookings = (result.data || []) as typeof bookings;
    count = result.count || 0;
  } catch {
    // Bookings table may not exist
  }

  // Get stats
  let todayCount = 0;
  let pendingCount = 0;
  let confirmedCount = 0;

  try {
    const { count: todayResult } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("scheduled_date", today);

    const { count: pendingResult } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("status", "pending");

    const { count: confirmedResult } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("status", "confirmed")
      .gte("scheduled_date", today);

    todayCount = todayResult || 0;
    pendingCount = pendingResult || 0;
    confirmedCount = confirmedResult || 0;
  } catch {
    // Stats query failed
  }

  const page = parseInt(params.page || "1", 10);
  const pageSize = 20;

  return (
    <div className="space-y-6">
      <BookingsHeader
        todayCount={todayCount}
        pendingCount={pendingCount}
        confirmedCount={confirmedCount}
      />

      <BookingsFilters
        currentStatus={params.status}
        currentDate={params.date}
        currentSearch={params.search}
      />

      <Suspense fallback={<BookingsListSkeleton />}>
        <BookingsList
          bookings={bookings}
          totalCount={count}
          currentPage={page}
          pageSize={pageSize}
        />
      </Suspense>
    </div>
  );
}

function BookingsListSkeleton() {
  return (
    <div className="relative">
      <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/10 via-brand-600/10 to-indigo-500/10 rounded-2xl blur opacity-50" />
      <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
        <div className="h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="p-4 border-b border-white/5 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-white/10 rounded-full" />
              <div className="flex-1">
                <div className="h-4 bg-white/10 rounded w-1/3 mb-2" />
                <div className="h-3 bg-white/5 rounded w-1/2" />
              </div>
              <div className="h-6 w-16 bg-white/10 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
