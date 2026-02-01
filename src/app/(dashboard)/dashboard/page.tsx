import Link from "next/link";
import { requireBusiness } from "@/lib/auth/actions";
import { getBookingStats, getTodaysBookings, getUpcomingBookings } from "@/lib/data/bookings";
import { getCustomerStats } from "@/lib/data/customers";
import { getMembershipStats } from "@/lib/data/memberships";
import {
  RiCalendarLine,
  RiTeamLine,
  RiMoneyDollarCircleLine,
  RiTimeLine,
  RiArrowRightLine,
  RiExternalLinkLine,
  RiFileTextLine,
  RiVipCrownLine,
} from "@remixicon/react";
import { formatCurrency } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

function formatTime(time: string) {
  if (!time) return "";
  try {
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours);
    const ampm = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  } catch {
    return time;
  }
}

export default async function DashboardPage() {
  const { user, business } = await requireBusiness();

  const [bookingStats, customerStats, membershipStats, todaysData, upcoming] =
    await Promise.all([
      getBookingStats(business.id),
      getCustomerStats(business.id),
      getMembershipStats(business.id),
      getTodaysBookings(business.id),
      getUpcomingBookings(business.id, 5),
    ]);

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
                <p className="text-2xl font-bold text-white">{bookingStats.today}</p>
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
                <p className="text-2xl font-bold text-white">{bookingStats.thisWeek}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500/20 to-green-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-6 hover:border-white/20 transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-green-400/20 to-green-600/20 rounded-xl flex items-center justify-center">
                <RiVipCrownLine className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Active Members</p>
                <p className="text-2xl font-bold text-white">{membershipStats.active}</p>
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
                <p className="text-2xl font-bold text-white">{formatCurrency(bookingStats.monthRevenue)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Schedule */}
        <div className="relative">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/10 via-brand-600/10 to-indigo-500/10 rounded-2xl blur opacity-50" />
          <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
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

            {todaysData.bookings && todaysData.bookings.length > 0 ? (
              <div className="divide-y divide-white/5">
                {todaysData.bookings.map((booking: any) => (
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

        {/* Upcoming Bookings */}
        <div className="relative">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/10 via-blue-600/10 to-indigo-500/10 rounded-2xl blur opacity-50" />
          <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
            <div className="h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Upcoming</h2>
              <Link
                href="/bookings?from=${new Date().toISOString().split('T')[0]}"
                className="text-sm text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 transition-colors"
              >
                View all
                <RiArrowRightLine className="w-4 h-4" />
              </Link>
            </div>

            {upcoming && upcoming.length > 0 ? (
              <div className="divide-y divide-white/5">
                {upcoming.map((booking: any) => (
                  <div key={booking.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center border border-white/10">
                        <RiCalendarLine className="w-5 h-5 text-gray-400" />
                      </div>
                      <div>
                        <p className="font-medium text-white">
                          {booking.contacts?.first_name} {booking.contacts?.last_name}
                        </p>
                        <p className="text-sm text-gray-400">
                          {new Date(booking.scheduled_date).toLocaleDateString()} · {formatTime(booking.scheduled_time)}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">{booking.service_types?.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10">
                  <RiTimeLine className="w-8 h-8 text-gray-500" />
                </div>
                <p className="text-gray-400">No upcoming bookings</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href={`/book/${business.slug}`}
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
          href="/customers"
          className="group relative bg-gray-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:border-brand-500/50 transition-all duration-300"
        >
          <div className="absolute inset-0 rounded-2xl bg-brand-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative flex items-center gap-4">
            <div className="w-12 h-12 bg-white/5 group-hover:bg-brand-500/20 rounded-xl flex items-center justify-center border border-white/10 transition-colors">
              <RiTeamLine className="w-6 h-6 text-gray-400 group-hover:text-brand-400 transition-colors" />
            </div>
            <div>
              <h3 className="font-semibold text-white mb-0.5">View Customers</h3>
              <p className="text-sm text-gray-400">{customerStats.total} total customers</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
