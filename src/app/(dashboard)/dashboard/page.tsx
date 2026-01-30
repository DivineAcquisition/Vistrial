import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  RiCalendarLine,
  RiTeamLine,
  RiMoneyDollarCircleLine,
  RiTimeLine,
  RiArrowRightLine,
  RiExternalLinkLine,
  RiFileTextLine,
  RiCodeSSlashLine,
} from "@remixicon/react";
import Link from "next/link";
import { formatCurrency, formatTime } from "@/lib/utils/format";

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Try businesses table first
  let business = null;
  const { data: businessData } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", user.id)
    .single();

  if (businessData) {
    business = businessData;
  } else {
    // Fall back to profiles table
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

  // Initialize stats
  let todayCount = 0;
  let weekBookings = 0;
  let activeMembers = 0;
  let monthRevenue = 0;
  let todayBookings: Array<{
    id: string;
    scheduled_time: string;
    address_line1?: string;
    total: number;
    status: string;
    contacts?: { first_name?: string; last_name?: string; phone?: string };
  }> = [];

  const today = new Date().toISOString().split("T")[0];

  // Try to get today's bookings
  try {
    const { data, count } = await supabase
      .from("bookings")
      .select("*, contacts(first_name, last_name, phone)", { count: "exact" })
      .eq("business_id", business.id)
      .eq("scheduled_date", today)
      .order("scheduled_time");
    
    todayBookings = data || [];
    todayCount = count || 0;
  } catch {
    // Bookings table may not exist
  }

  // Try to get week's bookings
  try {
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);

    const { count } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("business_id", business.id)
      .gte("scheduled_date", startOfWeek.toISOString().split("T")[0])
      .lte("scheduled_date", endOfWeek.toISOString().split("T")[0]);
    
    weekBookings = count || 0;
  } catch {
    // Table may not exist
  }

  // Try to get active members
  try {
    const { count } = await supabase
      .from("memberships")
      .select("*", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("status", "active");
    
    activeMembers = count || 0;
  } catch {
    // Table may not exist
  }

  // Try to get month's revenue
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    
    const { data: revenueData } = await supabase
      .from("bookings")
      .select("total")
      .eq("business_id", business.id)
      .eq("payment_status", "paid")
      .gte("scheduled_date", startOfMonth.toISOString().split("T")[0]);

    monthRevenue = revenueData?.reduce((sum: number, b: { total?: number }) => sum + (b.total || 0), 0) || 0;
  } catch {
    // Table may not exist
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
          Welcome back, {user.user_metadata?.full_name?.split(" ")[0] || "there"}!
        </h1>
        <p className="text-gray-400">Here&apos;s what&apos;s happening with your business today.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/20 to-brand-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6 hover:border-white/20 transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-brand-400/20 to-brand-600/20 rounded-xl flex items-center justify-center">
                <RiCalendarLine className="w-6 h-6 text-brand-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Today&apos;s Bookings</p>
                <p className="text-2xl font-bold text-white">{todayCount}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/20 to-blue-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6 hover:border-white/20 transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-400/20 to-blue-600/20 rounded-xl flex items-center justify-center">
                <RiTimeLine className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">This Week</p>
                <p className="text-2xl font-bold text-white">{weekBookings}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500/20 to-green-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6 hover:border-white/20 transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-green-400/20 to-green-600/20 rounded-xl flex items-center justify-center">
                <RiTeamLine className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Active Members</p>
                <p className="text-2xl font-bold text-white">{activeMembers}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500/20 to-amber-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6 hover:border-white/20 transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-amber-400/20 to-amber-600/20 rounded-xl flex items-center justify-center">
                <RiMoneyDollarCircleLine className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Month Revenue</p>
                <p className="text-2xl font-bold text-white">{formatCurrency(monthRevenue)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Schedule */}
      <div className="relative">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/10 via-brand-600/10 to-indigo-500/10 rounded-2xl blur opacity-50" />
        <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
          {/* Top accent line */}
          <div className="h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />
          
          <div className="p-6 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Today&apos;s Schedule</h2>
            <Link
              href="/bookings"
              className="text-sm text-brand-400 hover:text-brand-300 font-medium flex items-center gap-1 transition-colors"
            >
              View all
              <RiArrowRightLine className="w-4 h-4" />
            </Link>
          </div>

          {todayBookings && todayBookings.length > 0 ? (
            <div className="divide-y divide-white/5">
              {todayBookings.map((booking) => (
                <div key={booking.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center border border-white/10">
                      <RiTimeLine className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">
                        {booking.contacts?.first_name} {booking.contacts?.last_name}
                      </p>
                      <p className="text-sm text-gray-400">
                        {formatTime(booking.scheduled_time)} · {booking.address_line1 || "No address"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-white">
                      {formatCurrency(booking.total)}
                    </p>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full ${
                        booking.status === "confirmed"
                          ? "bg-green-500/20 text-green-400 border border-green-500/30"
                          : booking.status === "pending"
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          : "bg-white/10 text-gray-400 border border-white/10"
                      }`}
                    >
                      {booking.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10">
                <RiCalendarLine className="w-8 h-8 text-gray-500" />
              </div>
              <p className="text-gray-400 mb-4">No bookings scheduled for today</p>
              <Link
                href="/bookings/new"
                className="inline-flex items-center gap-2 text-brand-400 hover:text-brand-300 font-medium transition-colors"
              >
                Create a booking
                <RiArrowRightLine className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href={`https://book.vistrial.io/${business.slug}`}
          target="_blank"
          className="group relative overflow-hidden rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02]"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-brand-500 to-brand-600" />
          <div className="absolute inset-0 bg-gradient-to-r from-brand-400 to-brand-500 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          <div className="relative flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <RiExternalLinkLine className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-white mb-0.5">View Booking Page</h3>
              <p className="text-sm text-white/80">See what your customers see</p>
            </div>
          </div>
        </Link>

        <Link
          href="/quotes/new"
          className="group relative bg-gray-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:border-brand-500/50 transition-all duration-300"
        >
          <div className="absolute inset-0 rounded-2xl bg-brand-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative flex items-center gap-4">
            <div className="w-12 h-12 bg-white/5 group-hover:bg-brand-500/20 rounded-xl flex items-center justify-center border border-white/10 transition-colors">
              <RiFileTextLine className="w-6 h-6 text-gray-400 group-hover:text-brand-400 transition-colors" />
            </div>
            <div>
              <h3 className="font-semibold text-white mb-0.5">Create Quote</h3>
              <p className="text-sm text-gray-400">Send a quote with auto follow-up</p>
            </div>
          </div>
        </Link>

        <Link
          href="/settings/embed"
          className="group relative bg-gray-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:border-brand-500/50 transition-all duration-300"
        >
          <div className="absolute inset-0 rounded-2xl bg-brand-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative flex items-center gap-4">
            <div className="w-12 h-12 bg-white/5 group-hover:bg-brand-500/20 rounded-xl flex items-center justify-center border border-white/10 transition-colors">
              <RiCodeSSlashLine className="w-6 h-6 text-gray-400 group-hover:text-brand-400 transition-colors" />
            </div>
            <div>
              <h3 className="font-semibold text-white mb-0.5">Get Embed Code</h3>
              <p className="text-sm text-gray-400">Add booking to your website</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
