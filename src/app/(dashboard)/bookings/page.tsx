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
        return "bg-green-500/20 text-green-400 border border-green-500/30";
      case "pending":
        return "bg-amber-500/20 text-amber-400 border border-amber-500/30";
      case "completed":
        return "bg-blue-500/20 text-blue-400 border border-blue-500/30";
      case "cancelled":
        return "bg-red-500/20 text-red-400 border border-red-500/30";
      default:
        return "bg-white/10 text-gray-400 border border-white/10";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">Bookings</h1>
          <p className="text-gray-400">Manage your upcoming and past appointments</p>
        </div>
        <Link
          href="/bookings/new"
          className="group relative inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-white overflow-hidden transition-all duration-300 hover:scale-[1.02]"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-brand-500 to-brand-600" />
          <div className="absolute inset-0 bg-gradient-to-r from-brand-400 to-brand-500 opacity-0 group-hover:opacity-100 transition-opacity" />
          <RiAddLine className="relative w-5 h-5" />
          <span className="relative">New Booking</span>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/20 to-brand-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-4 hover:border-white/20 transition-all">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-brand-400/20 to-brand-600/20 rounded-xl flex items-center justify-center">
                <RiCalendarLine className="w-5 h-5 text-brand-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Today</p>
                <p className="text-xl font-bold text-white">{todayCount}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500/20 to-amber-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-4 hover:border-white/20 transition-all">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-400/20 to-amber-600/20 rounded-xl flex items-center justify-center">
                <RiTimeLine className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Upcoming</p>
                <p className="text-xl font-bold text-white">{upcomingCount}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500/20 to-green-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-4 hover:border-white/20 transition-all">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-400/20 to-green-600/20 rounded-xl flex items-center justify-center">
                <RiCheckLine className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Completed</p>
                <p className="text-xl font-bold text-white">{completedCount}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <RiSearchLine className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="Search bookings..."
            className="w-full pl-11 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:bg-white/10 focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 transition-all"
          />
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 text-gray-300 transition-all">
          <RiFilterLine className="w-5 h-5" />
          Filters
        </button>
      </div>

      {/* Bookings List */}
      <div className="relative">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/10 via-brand-600/10 to-indigo-500/10 rounded-2xl blur opacity-50" />
        <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
          {/* Top accent line */}
          <div className="h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />
          
          {bookings.length > 0 ? (
            <div className="divide-y divide-white/5">
              {bookings.map((booking) => (
                <div key={booking.id} className="p-4 hover:bg-white/5 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center flex-shrink-0 border border-white/10">
                        <RiCalendarLine className="w-5 h-5 text-gray-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-white">
                            {booking.contacts?.first_name} {booking.contacts?.last_name}
                          </p>
                          <span className={`text-xs px-2.5 py-0.5 rounded-full ${getStatusColor(booking.status)}`}>
                            {booking.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-400">
                          <span className="flex items-center gap-1">
                            <RiTimeLine className="w-4 h-4" />
                            {formatDate(booking.scheduled_date)} at {formatTime(booking.scheduled_time)}
                          </span>
                          {booking.service_types?.name && (
                            <span>{booking.service_types.name}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                          {booking.address_line1 && (
                            <span className="flex items-center gap-1">
                              <RiMapPinLine className="w-4 h-4" />
                              {booking.address_line1}, {booking.city}
                            </span>
                          )}
                          {booking.contacts?.phone && (
                            <a
                              href={`tel:${booking.contacts.phone}`}
                              className="flex items-center gap-1 hover:text-brand-400 transition-colors"
                            >
                              <RiPhoneLine className="w-4 h-4" />
                              {booking.contacts.phone}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-semibold text-white">
                        {formatCurrency(booking.total || 0)}
                      </p>
                      <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <RiMoreLine className="w-5 h-5 text-gray-400" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10">
                <RiCalendarLine className="w-8 h-8 text-gray-500" />
              </div>
              <h3 className="text-lg font-medium text-white mb-1">No bookings yet</h3>
              <p className="text-gray-400 mb-6">
                Bookings will appear here when customers book through your page.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Link
                  href="/bookings/new"
                  className="group relative inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-white overflow-hidden transition-all duration-300 hover:scale-[1.02]"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-brand-500 to-brand-600" />
                  <RiAddLine className="relative w-4 h-4" />
                  <span className="relative">Create Booking</span>
                </Link>
                <Link
                  href={`/book/${business.slug}`}
                  target="_blank"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 rounded-xl font-medium transition-all"
                >
                  View Booking Page
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
