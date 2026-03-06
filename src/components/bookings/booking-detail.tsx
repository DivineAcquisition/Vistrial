"use client";

import { useState } from "react";
import Link from "next/link";
import {
  RiArrowLeftLine,
  RiCalendarLine,
  RiTimeLine,
  RiMapPinLine,
  RiUserLine,
  RiPhoneLine,
  RiMailLine,
  RiMoreLine,
  RiEditLine,
  RiCloseLine,
  RiRefreshLine,
  RiSendPlaneLine,
  RiExternalLinkLine,
} from "@remixicon/react";
import { formatCurrency } from "@/lib/utils/format";

interface BookingDetailProps {
  booking: {
    id: string;
    scheduled_date: string;
    scheduled_time: string;
    status: string;
    total: number;
    subtotal: number;
    discount_amount?: number;
    deposit_amount?: number;
    deposit_paid?: boolean;
    payment_status?: string;
    address_line1: string;
    address_line2?: string;
    city: string;
    state: string;
    zip: string;
    bedrooms?: number;
    bathrooms?: number;
    has_pets?: boolean;
    customer_notes?: string;
    estimated_duration_minutes?: number;
    created_at: string;
    contact_id: string;
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
    booking_addons?: Array<{
      id: string;
      quantity: number;
      total_price: number;
      addon: {
        name: string;
      };
    }>;
  };
  messages: Array<{
    id: string;
    body: string;
    direction: string;
    created_at: string;
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  confirmed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  in_progress: "bg-brand-500/20 text-brand-400 border-brand-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  cancelled: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export function BookingDetail({ booking, messages }: BookingDetailProps) {
  const [status, setStatus] = useState(booking.status);
  const [updating, setUpdating] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const updateStatus = async (newStatus: string) => {
    setUpdating(true);
    try {
      await fetch(`/api/bookings/${booking.id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setStatus(newStatus);
    } catch (error) {
      console.error("Failed to update status:", error);
    }
    setUpdating(false);
    setShowStatusMenu(false);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/bookings"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RiArrowLeftLine className="w-5 h-5 text-gray-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
              Booking #{booking.id.slice(0, 8)}
            </h1>
            <p className="text-gray-500">
              Created {new Date(booking.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Status dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              className={`px-4 py-2 border rounded-xl font-medium transition-colors ${
                STATUS_COLORS[status] || STATUS_COLORS.pending
              }`}
              disabled={updating}
            >
              {status.replace("_", " ")}
            </button>

            {showStatusMenu && (
              <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => updateStatus(option.value)}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
                      status === option.value
                        ? "font-medium text-gray-900"
                        : "text-gray-400"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <RiMoreLine className="w-5 h-5 text-gray-500" />
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Schedule Card */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/20 to-brand-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Schedule</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center">
                    <RiCalendarLine className="w-5 h-5 text-brand-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Date</p>
                    <p className="font-medium text-gray-900">
                      {formatDate(booking.scheduled_date)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                    <RiTimeLine className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Time</p>
                    <p className="font-medium text-gray-900">
                      {formatTime(booking.scheduled_time)}
                      {booking.estimated_duration_minutes && (
                        <span className="text-gray-500 font-normal">
                          {" "}
                          (~{Math.round(booking.estimated_duration_minutes / 60)}h)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Service Details Card */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/20 to-brand-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Service Details</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      {booking.service_types.name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {booking.bedrooms} bed · {booking.bathrooms} bath
                      {booking.has_pets && " · Has pets"}
                    </p>
                  </div>
                  {booking.memberships && (
                    <span className="flex items-center gap-1 px-3 py-1 bg-green-500/20 text-green-400 text-sm rounded-full border border-green-500/30">
                      <RiRefreshLine className="w-4 h-4" />
                      {booking.memberships.frequency} member
                    </span>
                  )}
                </div>

                {/* Add-ons */}
                {booking.booking_addons && booking.booking_addons.length > 0 && (
                  <div className="pt-4 border-t border-gray-200">
                    <p className="text-sm font-medium text-gray-400 mb-2">Add-ons</p>
                    <div className="space-y-2">
                      {booking.booking_addons.map((ba) => (
                        <div key={ba.id} className="flex justify-between text-sm">
                          <span className="text-gray-400">
                            {ba.addon.name}
                            {ba.quantity > 1 && ` x${ba.quantity}`}
                          </span>
                          <span className="text-gray-900">
                            {formatCurrency(ba.total_price)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Special instructions */}
                {booking.customer_notes && (
                  <div className="pt-4 border-t border-gray-200">
                    <p className="text-sm font-medium text-gray-400 mb-2">
                      Special Instructions
                    </p>
                    <p className="text-sm text-gray-300 bg-gray-50 rounded-xl p-3 border border-gray-200">
                      {booking.customer_notes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Location Card */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/20 to-brand-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Location</h2>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <RiMapPinLine className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{booking.address_line1}</p>
                  {booking.address_line2 && (
                    <p className="text-gray-400">{booking.address_line2}</p>
                  )}
                  <p className="text-gray-400">
                    {booking.city}, {booking.state} {booking.zip}
                  </p>
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(
                      `${booking.address_line1}, ${booking.city}, ${booking.state} ${booking.zip}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-brand-400 hover:text-brand-300 mt-2 transition-colors"
                  >
                    Open in Maps
                    <RiExternalLinkLine className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Messages Card */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/20 to-brand-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Message History</h2>
                <button className="text-sm text-brand-400 hover:text-brand-300 transition-colors">
                  Send Message
                </button>
              </div>

              {messages.length > 0 ? (
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-3 ${
                        msg.direction === "outbound" ? "justify-end" : ""
                      }`}
                    >
                      <div
                        className={`max-w-[80%] p-3 rounded-xl ${
                          msg.direction === "outbound"
                            ? "bg-brand-500/20 text-brand-100 border border-brand-500/30"
                            : "bg-gray-50 text-gray-300 border border-gray-200"
                        }`}
                      >
                        <p className="text-sm">{msg.body}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(msg.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">No messages yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Customer Card */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/20 to-brand-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Customer</h2>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-brand-500/20 rounded-full flex items-center justify-center">
                    <RiUserLine className="w-5 h-5 text-brand-400" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {booking.contacts.first_name} {booking.contacts.last_name}
                    </p>
                    <Link
                      href={`/customers/${booking.contact_id}`}
                      className="text-sm text-brand-400 hover:text-brand-300 transition-colors"
                    >
                      View profile →
                    </Link>
                  </div>
                </div>

                <div className="space-y-2">
                  <a
                    href={`tel:${booking.contacts.phone}`}
                    className="flex items-center gap-2 text-gray-400 hover:text-gray-900 transition-colors"
                  >
                    <RiPhoneLine className="w-4 h-4" />
                    {booking.contacts.phone}
                  </a>
                  <a
                    href={`mailto:${booking.contacts.email}`}
                    className="flex items-center gap-2 text-gray-400 hover:text-gray-900 transition-colors"
                  >
                    <RiMailLine className="w-4 h-4" />
                    {booking.contacts.email}
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Card */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/20 to-brand-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Payment</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="text-gray-900">{formatCurrency(booking.subtotal)}</span>
                </div>
                {booking.discount_amount && booking.discount_amount > 0 && (
                  <div className="flex justify-between text-green-400">
                    <span>Discount</span>
                    <span>-{formatCurrency(booking.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-lg border-t border-gray-200 pt-3">
                  <span className="text-gray-900">Total</span>
                  <span className="text-gray-900">{formatCurrency(booking.total)}</span>
                </div>

                <div className="pt-3 border-t border-gray-200">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Deposit</span>
                    <span
                      className={
                        booking.deposit_paid ? "text-green-400" : "text-amber-400"
                      }
                    >
                      {formatCurrency(booking.deposit_amount || 0)}
                      {booking.deposit_paid ? " ✓ Paid" : " · Pending"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-gray-500">Balance due</span>
                    <span className="text-gray-900">
                      {formatCurrency(booking.total - (booking.deposit_amount || 0))}
                    </span>
                  </div>
                </div>

                <span
                  className={`inline-block px-3 py-1 text-sm rounded-full border ${
                    booking.payment_status === "paid"
                      ? "bg-green-500/20 text-green-400 border-green-500/30"
                      : booking.payment_status === "deposit_paid"
                      ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                      : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                  }`}
                >
                  {booking.payment_status?.replace("_", " ") || "pending"}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions Card */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/20 to-brand-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Actions</h2>
              <div className="space-y-2">
                <button className="w-full flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-gray-300 hover:bg-gray-50 hover:text-gray-900 transition-colors">
                  <RiSendPlaneLine className="w-4 h-4" />
                  Send Reminder
                </button>
                <button className="w-full flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-gray-300 hover:bg-gray-50 hover:text-gray-900 transition-colors">
                  <RiEditLine className="w-4 h-4" />
                  Reschedule
                </button>
                <button className="w-full flex items-center gap-2 px-4 py-2 border border-red-500/30 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors">
                  <RiCloseLine className="w-4 h-4" />
                  Cancel Booking
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
