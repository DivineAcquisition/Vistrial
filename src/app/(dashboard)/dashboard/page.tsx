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
  RiAddLine,
  RiFlashlightLine,
  RiLineChartLine,
  RiSparklingLine,
  RiMailLine,
  RiCheckboxCircleLine,
  RiSendPlaneLine,
  RiAlertLine,
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

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
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

  const firstName = user.user_metadata?.full_name?.split(" ")[0] || "there";

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 via-brand-600 to-purple-600 p-6 md:p-8 text-white">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-400/20 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <RiSparklingLine className="w-5 h-5 animate-pulse" />
                <span className="text-sm font-medium text-white/80">{getGreeting()}</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">
                Welcome back, {firstName}!
              </h1>
              <p className="text-white/70 max-w-lg">
                You have{" "}
                <span className="text-white font-semibold">
                  {bookingStats.today} bookings today
                </span>{" "}
                and{" "}
                <span className="text-white font-semibold">
                  {bookingStats.pending} pending
                </span>{" "}
                confirmations.
                {membershipStats.active > 0 && (
                  <>
                    {" "}Your membership base is growing with{" "}
                    <span className="text-emerald-300 font-semibold">
                      {membershipStats.active} active members
                    </span>
                    !
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/quotes/new"
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-brand-600 rounded-xl font-medium hover:bg-white/90 shadow-xl shadow-black/10 transition-all"
              >
                <RiAddLine className="w-5 h-5" />
                New Quote
              </Link>
              <Link
                href="/inbox"
                className="flex items-center gap-2 px-4 py-2.5 text-white border border-white/20 rounded-xl font-medium hover:bg-white/10 transition-all"
              >
                <RiMailLine className="w-5 h-5" />
                Inbox
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Bento Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Bookings */}
        <Link
          href="/bookings?date=today"
          className="group relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-5 hover:border-brand-500/30 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-brand-500/10 text-brand-400 group-hover:bg-brand-500 group-hover:text-white transition-colors">
              <RiCalendarLine className="w-5 h-5" />
            </div>
            <RiArrowRightLine className="w-4 h-4 text-gray-600 group-hover:text-brand-400 group-hover:translate-x-1 transition-all" />
          </div>
          <div className="text-3xl font-bold text-white mb-1">{bookingStats.today}</div>
          <p className="text-sm text-gray-500">Today&apos;s Bookings</p>
        </Link>

        {/* This Week */}
        <div className="group relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
              <RiTimeLine className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">{bookingStats.thisWeek}</div>
          <p className="text-sm text-gray-500">This Week</p>
        </div>

        {/* Active Members */}
        <Link
          href="/memberships?status=active"
          className="group relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-5 hover:border-green-500/30 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-green-500/10 text-green-400 group-hover:bg-green-500 group-hover:text-white transition-colors">
              <RiVipCrownLine className="w-5 h-5" />
            </div>
            <RiArrowRightLine className="w-4 h-4 text-gray-600 group-hover:text-green-400 group-hover:translate-x-1 transition-all" />
          </div>
          <div className="text-3xl font-bold text-white mb-1">{membershipStats.active}</div>
          <p className="text-sm text-gray-500">Active Members</p>
          {membershipStats.mrr > 0 && (
            <p className="text-xs text-green-400 font-medium mt-1">
              {formatCurrency(membershipStats.mrr)}/mo
            </p>
          )}
        </Link>

        {/* Month Revenue */}
        <div className="group relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-5 bg-gradient-to-br from-amber-500/5 to-transparent">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400">
              <RiMoneyDollarCircleLine className="w-5 h-5" />
            </div>
            <RiSparklingLine className="w-4 h-4 text-amber-400 animate-pulse" />
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            {formatCurrency(bookingStats.monthRevenue)}
          </div>
          <p className="text-sm text-gray-500">Month Revenue</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          href="/quotes/new"
          className="group p-4 rounded-xl border border-white/10 bg-gray-900/80 hover:border-brand-500/30 hover:shadow-lg hover:shadow-brand-500/5 transition-all text-left"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-brand-500/10 text-brand-400 group-hover:bg-brand-500 group-hover:text-white transition-colors">
              <RiAddLine className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium text-white">Add Quote</p>
              <p className="text-xs text-gray-500">Create new</p>
            </div>
          </div>
        </Link>

        <Link
          href="/sequences"
          className="group p-4 rounded-xl border border-white/10 bg-gray-900/80 hover:border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/5 transition-all text-left"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition-colors">
              <RiFlashlightLine className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium text-white">Sequences</p>
              <p className="text-xs text-gray-500">Automations</p>
            </div>
          </div>
        </Link>

        <Link
          href="/customers"
          className="group p-4 rounded-xl border border-white/10 bg-gray-900/80 hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/5 transition-all text-left"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
              <RiTeamLine className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium text-white">Customers</p>
              <p className="text-xs text-gray-500">{customerStats.total} total</p>
            </div>
          </div>
        </Link>

        <Link
          href="/analytics"
          className="group p-4 rounded-xl border border-white/10 bg-gray-900/80 hover:border-green-500/30 hover:shadow-lg hover:shadow-green-500/5 transition-all text-left"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10 text-green-400 group-hover:bg-green-500 group-hover:text-white transition-colors">
              <RiLineChartLine className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium text-white">Analytics</p>
              <p className="text-xs text-gray-500">Reports</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Today's Schedule + Upcoming */}
        <div className="xl:col-span-2 space-y-6">
          {/* Today's Schedule */}
          <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
            <div className="h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-white">Today&apos;s Schedule</h2>
                <span className="px-2 py-0.5 text-xs font-medium bg-brand-500/20 text-brand-400 rounded-full">
                  {todaysData.bookings?.length || 0} bookings
                </span>
              </div>
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
                {todaysData.bookings.slice(0, 5).map((booking: any) => (
                  <div
                    key={booking.id}
                    className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center border border-white/10">
                        <RiTimeLine className="w-5 h-5 text-gray-400" />
                      </div>
                      <div>
                        <p className="font-medium text-white">
                          {booking.contacts?.first_name} {booking.contacts?.last_name}
                        </p>
                        <p className="text-sm text-gray-400">
                          {formatTime(booking.scheduled_time)} ·{" "}
                          {booking.address_line1 || "No address"}
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

          {/* Upcoming */}
          <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
            <div className="h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Upcoming</h2>
              <Link
                href="/bookings"
                className="text-sm text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 transition-colors"
              >
                View all
                <RiArrowRightLine className="w-4 h-4" />
              </Link>
            </div>

            {upcoming && upcoming.length > 0 ? (
              <div className="divide-y divide-white/5">
                {upcoming.map((booking: any) => (
                  <div
                    key={booking.id}
                    className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center border border-white/10">
                        <RiCalendarLine className="w-5 h-5 text-gray-400" />
                      </div>
                      <div>
                        <p className="font-medium text-white">
                          {booking.contacts?.first_name} {booking.contacts?.last_name}
                        </p>
                        <p className="text-sm text-gray-400">
                          {new Date(booking.scheduled_date).toLocaleDateString()} ·{" "}
                          {formatTime(booking.scheduled_time)}
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

        {/* Sidebar - Insights & Quick Links */}
        <div className="space-y-6">
          {/* AI Insights Card */}
          <div className="relative bg-gradient-to-br from-brand-500/10 via-purple-500/10 to-brand-500/5 rounded-2xl border border-brand-500/20 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-gradient-to-br from-brand-500 to-purple-500">
                <RiSparklingLine className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Insights</h3>
                <p className="text-xs text-gray-500">Smart recommendations</p>
              </div>
            </div>

            <div className="space-y-3">
              {bookingStats.pending > 0 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <RiAlertLine className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-300">
                      {bookingStats.pending} pending confirmations
                    </p>
                    <p className="text-xs text-amber-400/70">Need attention</p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <RiCheckboxCircleLine className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-300">
                    {formatCurrency(bookingStats.monthRevenue)} this month
                  </p>
                  <p className="text-xs text-green-400/70">Keep it up!</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <RiSendPlaneLine className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-300">
                    {customerStats.newThisMonth} new customers
                  </p>
                  <p className="text-xs text-blue-400/70">This month</p>
                </div>
              </div>
            </div>

            <Link
              href="/analytics"
              className="flex items-center justify-center gap-1 w-full mt-4 py-2 text-sm text-brand-400 hover:text-brand-300 transition-colors"
            >
              View detailed insights
              <RiArrowRightLine className="w-4 h-4" />
            </Link>
          </div>

          {/* Quick Links */}
          <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-5">
            <h3 className="font-semibold text-white mb-4">Quick Links</h3>
            <div className="space-y-2">
              <Link
                href={`/book/${business.slug}`}
                target="_blank"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors group"
              >
                <div className="p-2 rounded-lg bg-brand-500/10 text-brand-400 group-hover:bg-brand-500 group-hover:text-white transition-colors">
                  <RiExternalLinkLine className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Booking Page</p>
                  <p className="text-xs text-gray-500">View live page</p>
                </div>
                <RiArrowRightLine className="w-4 h-4 text-gray-600 group-hover:text-brand-400 transition-colors" />
              </Link>

              <Link
                href="/settings"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors group"
              >
                <div className="p-2 rounded-lg bg-gray-500/10 text-gray-400 group-hover:bg-gray-500 group-hover:text-white transition-colors">
                  <RiFileTextLine className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Settings</p>
                  <p className="text-xs text-gray-500">Configure business</p>
                </div>
                <RiArrowRightLine className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
