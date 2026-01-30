import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  Calendar,
  Users,
  DollarSign,
  Clock,
  ArrowRight,
} from "lucide-react";
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
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome back, {user.user_metadata?.full_name?.split(" ")[0] || "there"}!
        </h1>
        <p className="text-slate-500">Here&apos;s what&apos;s happening with your business today.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center">
              <Calendar className="w-6 h-6 text-violet-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Today&apos;s Bookings</p>
              <p className="text-2xl font-bold text-slate-900">{todayCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Clock className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">This Week</p>
              <p className="text-2xl font-bold text-slate-900">{weekBookings}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Active Members</p>
              <p className="text-2xl font-bold text-slate-900">{activeMembers}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Month Revenue</p>
              <p className="text-2xl font-bold text-slate-900">{formatCurrency(monthRevenue)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Schedule */}
      <div className="bg-white rounded-xl border">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Today&apos;s Schedule</h2>
          <Link
            href="/bookings"
            className="text-sm text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1"
          >
            View all
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {todayBookings && todayBookings.length > 0 ? (
          <div className="divide-y">
            {todayBookings.map((booking) => (
              <div key={booking.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                    <Clock className="w-5 h-5 text-slate-500" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">
                      {booking.contacts?.first_name} {booking.contacts?.last_name}
                    </p>
                    <p className="text-sm text-slate-500">
                      {formatTime(booking.scheduled_time)} · {booking.address_line1 || "No address"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900">
                    {formatCurrency(booking.total)}
                  </p>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      booking.status === "confirmed"
                        ? "bg-green-100 text-green-700"
                        : booking.status === "pending"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {booking.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No bookings scheduled for today</p>
            <Link
              href="/bookings/new"
              className="mt-4 inline-flex items-center gap-2 text-violet-600 hover:text-violet-700 font-medium"
            >
              Create a booking
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href={`https://book.vistrial.io/${business.slug}`}
          target="_blank"
          className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl p-6 hover:opacity-90 transition-opacity"
        >
          <h3 className="font-semibold mb-1">View Booking Page</h3>
          <p className="text-sm text-white/80">See what your customers see</p>
        </Link>

        <Link
          href="/quotes/new"
          className="bg-white border rounded-xl p-6 hover:border-violet-300 transition-colors"
        >
          <h3 className="font-semibold text-slate-900 mb-1">Create Quote</h3>
          <p className="text-sm text-slate-500">Send a quote with auto follow-up</p>
        </Link>

        <Link
          href="/settings/embed"
          className="bg-white border rounded-xl p-6 hover:border-violet-300 transition-colors"
        >
          <h3 className="font-semibold text-slate-900 mb-1">Get Embed Code</h3>
          <p className="text-sm text-slate-500">Add booking to your website</p>
        </Link>
      </div>
    </div>
  );
}
