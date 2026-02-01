import Link from "next/link";
import { requireBusiness } from "@/lib/auth/actions";
import { getBookings, getBookingStats } from "@/lib/data/bookings";
import {
  RiCalendarLine,
  RiAddLine,
  RiArrowRightLine,
  RiTimeLine,
  RiMapPinLine,
  RiAlertLine,
  RiCheckLine,
  RiSearchLine,
} from "@remixicon/react";
import { formatCurrency } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

interface BookingsPageProps {
  searchParams: Promise<{
    status?: string;
    from?: string;
    to?: string;
    search?: string;
    page?: string;
  }>;
}

export default async function BookingsPage({ searchParams }: BookingsPageProps) {
  const { business } = await requireBusiness();
  const params = await searchParams;

  const filters = {
    status: params.status,
    dateFrom: params.from,
    dateTo: params.to,
    search: params.search,
    page: params.page ? parseInt(params.page) : 1,
  };

  const [{ bookings, total, page, totalPages }, stats] = await Promise.all([
    getBookings(business.id, filters),
    getBookingStats(business.id),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
          <p className="text-gray-500">Manage your appointments and schedule</p>
        </div>
        <Link
          href="/bookings/new"
          className="flex items-center gap-2 bg-gradient-to-r from-brand-500 to-brand-600 text-white px-4 py-2.5 rounded-xl font-medium hover:from-brand-600 hover:to-brand-700 transition-all shadow-lg shadow-brand-500/25"
        >
          <RiAddLine className="w-5 h-5" />
          New Booking
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-brand-50 rounded-xl flex items-center justify-center">
              <RiCalendarLine className="w-6 h-6 text-brand-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Today</p>
              <p className="text-2xl font-bold text-gray-900">{stats.today}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
              <RiTimeLine className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">This Week</p>
              <p className="text-2xl font-bold text-gray-900">{stats.thisWeek}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
              <RiAlertLine className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-2xl font-bold text-gray-900">{stats.pending}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center">
              <RiCheckLine className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Month Revenue</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.monthRevenue)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <form className="flex-1 min-w-[200px] relative">
          <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            name="search"
            defaultValue={params.search}
            placeholder="Search bookings..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </form>

        <select
          name="status"
          defaultValue={params.status || "all"}
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="canceled">Canceled</option>
        </select>

        <input
          type="date"
          name="from"
          defaultValue={params.from}
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />

        <input
          type="date"
          name="to"
          defaultValue={params.to}
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
      </div>

      {/* Bookings List */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="h-px bg-gradient-to-r from-transparent via-brand-500 to-transparent" />

        {bookings.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {bookings.map((booking) => (
              <Link
                key={booking.id}
                href={`/bookings/${booking.id}`}
                className="block p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center border border-gray-200">
                      <RiTimeLine className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {booking.contacts?.first_name} {booking.contacts?.last_name}
                      </p>
                      <div className="flex items-center gap-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <RiCalendarLine className="w-3.5 h-3.5" />
                          {new Date(booking.scheduled_date).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <RiTimeLine className="w-3.5 h-3.5" />
                          {booking.scheduled_time}
                        </span>
                        {booking.address_line1 && (
                          <span className="flex items-center gap-1">
                            <RiMapPinLine className="w-3.5 h-3.5" />
                            {booking.address_line1}, {booking.city}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {booking.service_types?.name && (
                      <div className="text-right">
                        <p className="text-sm text-gray-400">Service</p>
                        <p className="font-medium text-gray-900">{booking.service_types.name}</p>
                      </div>
                    )}
                    <div className="text-right">
                      <p className="text-sm text-gray-400">Total</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(booking.total)}</p>
                    </div>
                    <span
                      className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                        booking.status === "confirmed"
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : booking.status === "pending"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : booking.status === "completed"
                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                          : "bg-gray-50 text-gray-600 border border-gray-200"
                      }`}
                    >
                      {booking.status}
                    </span>
                    {booking.memberships?.frequency && (
                      <span className="px-2 py-1 bg-brand-50 text-brand-600 text-xs font-medium rounded-full border border-brand-200">
                        {booking.memberships.frequency}
                      </span>
                    )}
                    <RiArrowRightLine className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-200">
              <RiCalendarLine className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500 mb-4">No bookings found</p>
            <Link
              href="/bookings/new"
              className="inline-flex items-center gap-2 text-brand-600 hover:text-brand-700 font-medium transition-colors"
            >
              Create a booking
              <RiArrowRightLine className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * 25 + 1} to {Math.min(page * 25, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              {page > 1 && (
                <Link
                  href={`/bookings?page=${page - 1}${params.status ? `&status=${params.status}` : ""}${params.from ? `&from=${params.from}` : ""}${params.to ? `&to=${params.to}` : ""}`}
                  className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/bookings?page=${page + 1}${params.status ? `&status=${params.status}` : ""}${params.from ? `&from=${params.from}` : ""}${params.to ? `&to=${params.to}` : ""}`}
                  className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
