"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RiCalendarLine,
  RiTimeLine,
  RiMapPinLine,
  RiMoreLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiUserLine,
  RiRefreshLine,
  RiAddLine,
} from "@remixicon/react";
import { formatCurrency } from "@/lib/utils/format";

interface Booking {
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
}

interface BookingsListProps {
  bookings: Booking[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
  confirmed: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  in_progress: "bg-brand-500/20 text-brand-400 border border-brand-500/30",
  completed: "bg-green-500/20 text-green-400 border border-green-500/30",
  cancelled: "bg-gray-500/20 text-gray-400 border border-gray-500/30",
};

export function BookingsList({
  bookings,
  totalCount,
  currentPage,
  pageSize,
}: BookingsListProps) {
  const router = useRouter();
  const totalPages = Math.ceil(totalCount / pageSize);

  const goToPage = (page: number) => {
    const params = new URLSearchParams(window.location.search);
    params.set("page", page.toString());
    router.push(`/bookings?${params.toString()}`);
  };

  if (bookings.length === 0) {
    return (
      <div className="relative">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/10 via-brand-600/10 to-indigo-500/10 rounded-2xl blur opacity-50" />
        <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-12 text-center">
          <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10">
            <RiCalendarLine className="w-8 h-8 text-gray-500" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No bookings found</h3>
          <p className="text-gray-400 mb-6">
            Create a booking manually or share your booking link with customers.
          </p>
          <Link
            href="/bookings/new"
            className="group relative inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-white overflow-hidden transition-all duration-300 hover:scale-[1.02]"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-brand-500 to-brand-600" />
            <div className="absolute inset-0 bg-gradient-to-r from-brand-400 to-brand-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            <RiAddLine className="relative w-5 h-5" />
            <span className="relative">Create Booking</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/10 via-brand-600/10 to-indigo-500/10 rounded-2xl blur opacity-50" />
      <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
        {/* Top accent line */}
        <div className="h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">
                  Customer
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">
                  Service
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">
                  Date & Time
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">
                  Address
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">
                  Status
                </th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">
                  Total
                </th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {bookings.map((booking) => (
                <tr
                  key={booking.id}
                  className="hover:bg-white/5 cursor-pointer transition-colors"
                  onClick={() => router.push(`/bookings/${booking.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-brand-500/20 rounded-full flex items-center justify-center">
                        <RiUserLine className="w-4 h-4 text-brand-400" />
                      </div>
                      <div>
                        <p className="font-medium text-white">
                          {booking.contacts.first_name} {booking.contacts.last_name}
                        </p>
                        <p className="text-sm text-gray-500">{booking.contacts.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-white">{booking.service_types.name}</span>
                      {booking.memberships && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full border border-green-500/30">
                          <RiRefreshLine className="w-3 h-3" />
                          {booking.memberships.frequency}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-white">
                      <RiCalendarLine className="w-4 h-4 text-gray-500" />
                      {formatDate(booking.scheduled_date)}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <RiTimeLine className="w-4 h-4" />
                      {formatTime(booking.scheduled_time)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-white">{booking.address_line1}</div>
                    <div className="text-sm text-gray-500">
                      {booking.city}, {booking.state}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                        STATUS_COLORS[booking.status] || STATUS_COLORS.pending
                      }`}
                    >
                      {booking.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-white">
                    {formatCurrency(booking.total)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Open actions menu
                      }}
                      className="p-1 hover:bg-white/10 rounded transition-colors"
                    >
                      <RiMoreLine className="w-5 h-5 text-gray-500" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-white/5">
          {bookings.map((booking) => (
            <Link
              key={booking.id}
              href={`/bookings/${booking.id}`}
              className="block p-4 hover:bg-white/5 transition-colors"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-medium text-white">
                    {booking.contacts.first_name} {booking.contacts.last_name}
                  </p>
                  <p className="text-sm text-gray-500">{booking.service_types.name}</p>
                </div>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${
                    STATUS_COLORS[booking.status] || STATUS_COLORS.pending
                  }`}
                >
                  {booking.status}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <RiCalendarLine className="w-4 h-4" />
                  {formatDate(booking.scheduled_date)}
                </span>
                <span className="flex items-center gap-1">
                  <RiTimeLine className="w-4 h-4" />
                  {formatTime(booking.scheduled_time)}
                </span>
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="flex items-center gap-1 text-sm text-gray-500">
                  <RiMapPinLine className="w-4 h-4" />
                  {booking.address_line1}
                </span>
                <span className="font-medium text-white">{formatCurrency(booking.total)}</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 bg-white/5">
            <p className="text-sm text-gray-400">
              Showing {(currentPage - 1) * pageSize + 1} to{" "}
              {Math.min(currentPage * pageSize, totalCount)} of {totalCount}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-2 border border-white/10 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
              >
                <RiArrowLeftSLine className="w-4 h-4 text-gray-400" />
              </button>
              <span className="text-sm text-gray-400">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-2 border border-white/10 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
              >
                <RiArrowRightSLine className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(time: string) {
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}
