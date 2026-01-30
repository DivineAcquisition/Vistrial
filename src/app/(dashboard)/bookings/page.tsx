import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  RiCalendarLine,
  RiTimeLine,
  RiMapPinLine,
  RiAddLine,
  RiSearchLine,
  RiFilterLine,
  RiMoreLine,
  RiCheckLine,
  RiPhoneLine,
} from "@remixicon/react";
import { formatCurrency, formatTime, formatDate } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

interface Booking {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  total: number;
  address_line1?: string;
  city?: string;
  state?: string;
  contacts?: {
    first_name?: string;
    last_name?: string;
    phone?: string;
  };
  service_types?: {
    name?: string;
  };
}

export default async function BookingsPage() {
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

  // Get bookings
  let bookings: Booking[] = [];
  let upcomingCount = 0;
  let todayCount = 0;
  let completedCount = 0;

  try {
    const today = new Date().toISOString().split("T")[0];

    const { data } = await supabase
      .from("bookings")
      .select(`
        *,
        contacts(first_name, last_name, phone),
        service_types(name)
      `)
      .eq("business_id", business.id)
      .gte("scheduled_date", today)
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true })
      .limit(50);

    bookings = (data || []) as Booking[];

    // Count stats
    const { count: upcoming } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("business_id", business.id)
      .gte("scheduled_date", today)
      .in("status", ["confirmed", "pending"]);

    const { count: todayBookings } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("scheduled_date", today);

    const { count: completed } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("status", "completed");

    upcomingCount = upcoming || 0;
    todayCount = todayBookings || 0;
    completedCount = completed || 0;
  } catch {
    // Bookings table may not exist
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400";
      case "pending":
        return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400";
      case "completed":
        return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400";
      case "cancelled":
        return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400";
      default:
        return "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Bookings</h1>
          <p className="text-gray-500 dark:text-gray-400">Manage your upcoming and past appointments</p>
        </div>
        <Link
          href="/bookings/new"
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl font-medium transition-colors"
        >
          <RiAddLine className="w-5 h-5" />
          New Booking
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-100 dark:bg-brand-900/30 rounded-lg flex items-center justify-center">
              <RiCalendarLine className="w-5 h-5 text-brand-600 dark:text-brand-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Today</p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-50">{todayCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
              <RiTimeLine className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Upcoming</p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-50">{upcomingCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <RiCheckLine className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Completed</p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-50">{completedCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search bookings..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-50"
          />
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300">
          <RiFilterLine className="w-5 h-5" />
          Filters
        </button>
      </div>

      {/* Bookings List */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {bookings.length > 0 ? (
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {bookings.map((booking) => (
              <div key={booking.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                      <RiCalendarLine className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-gray-900 dark:text-gray-50">
                          {booking.contacts?.first_name} {booking.contacts?.last_name}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(booking.status)}`}>
                          {booking.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <RiTimeLine className="w-4 h-4" />
                          {formatDate(booking.scheduled_date)} at {formatTime(booking.scheduled_time)}
                        </span>
                        {booking.service_types?.name && (
                          <span>{booking.service_types.name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {booking.address_line1 && (
                          <span className="flex items-center gap-1">
                            <RiMapPinLine className="w-4 h-4" />
                            {booking.address_line1}, {booking.city}
                          </span>
                        )}
                        {booking.contacts?.phone && (
                          <a
                            href={`tel:${booking.contacts.phone}`}
                            className="flex items-center gap-1 hover:text-brand-600"
                          >
                            <RiPhoneLine className="w-4 h-4" />
                            {booking.contacts.phone}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-semibold text-gray-900 dark:text-gray-50">
                      {formatCurrency(booking.total || 0)}
                    </p>
                    <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                      <RiMoreLine className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <RiCalendarLine className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-50 mb-1">No bookings yet</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Bookings will appear here when customers book through your page.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/bookings/new"
                className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl font-medium transition-colors"
              >
                <RiAddLine className="w-4 h-4" />
                Create Booking
              </Link>
              <Link
                href={`/book/${business.slug}`}
                target="_blank"
                className="inline-flex items-center gap-2 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-xl font-medium transition-colors"
              >
                View Booking Page
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
