// @ts-nocheck
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireBusiness } from "@/lib/auth/actions";
import { getCustomer } from "@/lib/data/customers";
import { formatCurrency } from "@/lib/utils/format";
import {
  RiPhoneLine,
  RiMailLine,
  RiMapPinLine,
  RiCalendarLine,
  RiArrowLeftLine,
  RiArrowRightLine,
  RiVipCrownLine,
  RiHome4Line,
  RiPlanetLine,
  RiKeyLine,
  RiCarLine,
  RiFileTextLine,
  RiMessage2Line,
  RiPushpin2Line,
  RiEditLine,
  RiAddLine,
  RiMoneyDollarCircleLine,
  RiHistoryLine,
  RiExternalLinkLine,
} from "@remixicon/react";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatDate(date: string | Date | null) {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(time: string | null) {
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

function formatPhone(phone: string | null) {
  if (!phone) return "N/A";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

export default async function CustomerDetailPage({ params }: PageProps) {
  const { business } = await requireBusiness();
  const { id } = await params;

  const customer = await getCustomer(id);

  if (!customer || customer.business_id !== business.id) {
    notFound();
  }

  const statusColors: Record<string, string> = {
    lead: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    customer: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    member: "bg-green-500/20 text-green-400 border-green-500/30",
    inactive: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    archived: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  const lifecycleColors: Record<string, string> = {
    new: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    engaged: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    converted: "bg-green-500/20 text-green-400 border-green-500/30",
    loyal: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    at_risk: "bg-red-500/20 text-red-400 border-red-500/30",
    churned: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };

  const bookingStatusColors: Record<string, string> = {
    pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    confirmed: "bg-green-500/20 text-green-400 border-green-500/30",
    completed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    canceled: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/customers"
            className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-colors border border-white/10"
          >
            <RiArrowLeftLine className="w-5 h-5 text-gray-400" />
          </Link>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-brand-500/20 to-brand-600/20 rounded-2xl flex items-center justify-center border border-white/10">
              <span className="text-2xl font-bold text-brand-400">
                {customer.first_name?.[0]}
                {customer.last_name?.[0]}
              </span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                {customer.first_name} {customer.last_name}
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <span
                  className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${statusColors[customer.status] || statusColors.lead}`}
                >
                  {customer.status}
                </span>
                <span
                  className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${lifecycleColors[customer.lifecycle_stage] || lifecycleColors.new}`}
                >
                  {customer.lifecycle_stage}
                </span>
                {customer.tags?.map((tag: any) => (
                  <span
                    key={tag.id}
                    className="px-2 py-0.5 text-xs font-medium rounded-full border"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                      borderColor: `${tag.color}40`,
                    }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/customers/${customer.id}/edit`}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10 transition-colors"
          >
            <RiEditLine className="w-4 h-4" />
            Edit
          </Link>
          <button className="flex items-center gap-2 bg-gradient-to-r from-brand-500 to-brand-600 text-white px-4 py-2.5 rounded-xl font-medium hover:from-brand-600 hover:to-brand-700 transition-all">
            <RiMessage2Line className="w-4 h-4" />
            Send SMS
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Overview Card */}
          <div className="relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/10 via-brand-600/10 to-indigo-500/10 rounded-2xl blur opacity-50" />
            <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
              <div className="h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />
              <div className="p-6">
                <h2 className="text-lg font-semibold text-white mb-4">
                  Customer Overview
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <p className="text-sm text-gray-400">Total Bookings</p>
                    <p className="text-2xl font-bold text-white">
                      {customer.total_bookings || 0}
                    </p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <p className="text-sm text-gray-400">Total Spent</p>
                    <p className="text-2xl font-bold text-white">
                      {formatCurrency(customer.total_spent || 0)}
                    </p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <p className="text-sm text-gray-400">Avg Booking</p>
                    <p className="text-2xl font-bold text-white">
                      {formatCurrency(customer.average_booking_value || 0)}
                    </p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <p className="text-sm text-gray-400">Last Booking</p>
                    <p className="text-lg font-bold text-white">
                      {formatDate(customer.last_booking_at)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Contact Info */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-3">
                      Contact Information
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <RiPhoneLine className="w-4 h-4 text-gray-500" />
                        <span className="text-white">
                          {formatPhone(customer.phone)}
                        </span>
                        {customer.sms_opted_in ? (
                          <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                            SMS OK
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">
                            Opted Out
                          </span>
                        )}
                      </div>
                      {customer.email && (
                        <div className="flex items-center gap-3">
                          <RiMailLine className="w-4 h-4 text-gray-500" />
                          <span className="text-white">{customer.email}</span>
                          {customer.email_opted_in ? (
                            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                              Email OK
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">
                              Opted Out
                            </span>
                          )}
                        </div>
                      )}
                      {customer.address_line1 && (
                        <div className="flex items-start gap-3">
                          <RiMapPinLine className="w-4 h-4 text-gray-500 mt-0.5" />
                          <div className="text-white">
                            <p>{customer.address_line1}</p>
                            {customer.address_line2 && (
                              <p>{customer.address_line2}</p>
                            )}
                            <p>
                              {customer.city}, {customer.state} {customer.zip}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Property Details */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-3">
                      Property Details
                    </h3>
                    <div className="space-y-3">
                      {customer.property_type && (
                        <div className="flex items-center gap-3">
                          <RiHome4Line className="w-4 h-4 text-gray-500" />
                          <span className="text-white capitalize">
                            {customer.property_type}
                          </span>
                          {customer.property_sqft && (
                            <span className="text-gray-400">
                              {customer.property_sqft.toLocaleString()} sqft
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-4 text-white">
                        {customer.default_bedrooms !== null && (
                          <span>{customer.default_bedrooms} bed</span>
                        )}
                        {customer.default_bathrooms !== null && (
                          <span>{customer.default_bathrooms} bath</span>
                        )}
                      </div>
                      {customer.has_pets && (
                        <div className="flex items-center gap-3">
                          <RiPlanetLine className="w-4 h-4 text-amber-400" />
                          <span className="text-white">
                            Has pets
                            {customer.pet_details && (
                              <span className="text-gray-400">
                                {" "}
                                - {customer.pet_details}
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                      {customer.entry_instructions && (
                        <div className="flex items-start gap-3">
                          <RiKeyLine className="w-4 h-4 text-gray-500 mt-0.5" />
                          <span className="text-gray-400">
                            {customer.entry_instructions}
                          </span>
                        </div>
                      )}
                      {customer.parking_instructions && (
                        <div className="flex items-start gap-3">
                          <RiCarLine className="w-4 h-4 text-gray-500 mt-0.5" />
                          <span className="text-gray-400">
                            {customer.parking_instructions}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bookings */}
          <div className="relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/10 via-blue-600/10 to-indigo-500/10 rounded-2xl blur opacity-50" />
            <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
              <div className="h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Bookings</h2>
                <Link
                  href={`/bookings/new?customer=${customer.id}`}
                  className="text-sm text-brand-400 hover:text-brand-300 font-medium flex items-center gap-1 transition-colors"
                >
                  <RiAddLine className="w-4 h-4" />
                  New Booking
                </Link>
              </div>
              {customer.bookings && customer.bookings.length > 0 ? (
                <div className="divide-y divide-white/5">
                  {customer.bookings.slice(0, 5).map((booking: any) => (
                    <Link
                      key={booking.id}
                      href={`/bookings/${booking.id}`}
                      className="block p-4 hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-white/10">
                            <RiCalendarLine className="w-5 h-5 text-gray-400" />
                          </div>
                          <div>
                            <p className="font-medium text-white">
                              {booking.service_types?.name || "Service"}
                            </p>
                            <p className="text-sm text-gray-400">
                              {formatDate(booking.scheduled_date)}{" "}
                              {formatTime(booking.scheduled_time)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <p className="font-semibold text-white">
                            {formatCurrency(booking.total || 0)}
                          </p>
                          <span
                            className={`px-2.5 py-1 text-xs font-medium rounded-full border ${bookingStatusColors[booking.status] || bookingStatusColors.pending}`}
                          >
                            {booking.status}
                          </span>
                          <RiArrowRightLine className="w-4 h-4 text-gray-500" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <RiCalendarLine className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                  <p className="text-gray-400">No bookings yet</p>
                </div>
              )}
              {customer.bookings && customer.bookings.length > 5 && (
                <div className="p-4 border-t border-white/10 text-center">
                  <Link
                    href={`/bookings?customer=${customer.id}`}
                    className="text-sm text-brand-400 hover:text-brand-300"
                  >
                    View all {customer.bookings.length} bookings
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Memberships */}
          {customer.memberships && customer.memberships.length > 0 && (
            <div className="relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500/10 via-green-600/10 to-emerald-500/10 rounded-2xl blur opacity-50" />
              <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
                <div className="h-px bg-gradient-to-r from-transparent via-green-500/50 to-transparent" />
                <div className="p-6 border-b border-white/10">
                  <h2 className="text-lg font-semibold text-white">
                    Memberships
                  </h2>
                </div>
                <div className="divide-y divide-white/5">
                  {customer.memberships.map((membership: any) => (
                    <Link
                      key={membership.id}
                      href={`/memberships/${membership.id}`}
                      className="block p-4 hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-gradient-to-br from-green-500/20 to-green-600/20 rounded-xl flex items-center justify-center">
                            <RiVipCrownLine className="w-5 h-5 text-green-400" />
                          </div>
                          <div>
                            <p className="font-medium text-white">
                              {membership.service_types?.name || "Service"} -{" "}
                              {membership.frequency}
                            </p>
                            <p className="text-sm text-gray-400">
                              {formatCurrency(membership.price_per_service || 0)}{" "}
                              per service
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span
                            className={`px-2.5 py-1 text-xs font-medium rounded-full border ${
                              membership.status === "active"
                                ? "bg-green-500/20 text-green-400 border-green-500/30"
                                : membership.status === "paused"
                                  ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                                  : "bg-gray-500/20 text-gray-400 border-gray-500/30"
                            }`}
                          >
                            {membership.status}
                          </span>
                          <RiArrowRightLine className="w-4 h-4 text-gray-500" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Activity Timeline */}
          <div className="relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-gray-500/10 via-gray-600/10 to-gray-500/10 rounded-2xl blur opacity-50" />
            <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
              <div className="h-px bg-gradient-to-r from-transparent via-gray-500/50 to-transparent" />
              <div className="p-6 border-b border-white/10">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <RiHistoryLine className="w-5 h-5" />
                  Activity
                </h2>
              </div>
              {customer.activity && customer.activity.length > 0 ? (
                <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
                  {customer.activity.slice(0, 20).map((activity: any) => (
                    <div key={activity.id} className="flex gap-4">
                      <div className="w-8 h-8 bg-white/5 rounded-full flex items-center justify-center border border-white/10 flex-shrink-0">
                        {activity.activity_type.includes("booking") ? (
                          <RiCalendarLine className="w-4 h-4 text-blue-400" />
                        ) : activity.activity_type.includes("message") ? (
                          <RiMessage2Line className="w-4 h-4 text-green-400" />
                        ) : activity.activity_type.includes("payment") ? (
                          <RiMoneyDollarCircleLine className="w-4 h-4 text-amber-400" />
                        ) : (
                          <RiHistoryLine className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white">{activity.title}</p>
                        {activity.description && (
                          <p className="text-xs text-gray-400 truncate">
                            {activity.description}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {formatDate(activity.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <RiHistoryLine className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                  <p className="text-gray-400">No activity recorded</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/10 via-brand-600/10 to-indigo-500/10 rounded-2xl blur opacity-50" />
            <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
              <div className="h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />
              <div className="p-6">
                <h2 className="text-lg font-semibold text-white mb-4">
                  Quick Actions
                </h2>
                <div className="space-y-2">
                  <Link
                    href={`/bookings/new?customer=${customer.id}`}
                    className="w-full flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-xl text-white transition-colors border border-white/10"
                  >
                    <RiCalendarLine className="w-5 h-5 text-brand-400" />
                    Create Booking
                  </Link>
                  <Link
                    href={`/quotes/new?customer=${customer.id}`}
                    className="w-full flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-xl text-white transition-colors border border-white/10"
                  >
                    <RiFileTextLine className="w-5 h-5 text-brand-400" />
                    Create Quote
                  </Link>
                  <Link
                    href={`/memberships/new?customer=${customer.id}`}
                    className="w-full flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-xl text-white transition-colors border border-white/10"
                  >
                    <RiVipCrownLine className="w-5 h-5 text-brand-400" />
                    Create Membership
                  </Link>
                  {customer.portal_enabled && (
                    <Link
                      href={`/portal/${business.slug}?token=${customer.portal_token}`}
                      target="_blank"
                      className="w-full flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-xl text-white transition-colors border border-white/10"
                    >
                      <RiExternalLinkLine className="w-5 h-5 text-brand-400" />
                      View Portal
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500/10 via-amber-600/10 to-orange-500/10 rounded-2xl blur opacity-50" />
            <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
              <div className="h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Notes</h2>
                <button className="text-brand-400 hover:text-brand-300">
                  <RiAddLine className="w-5 h-5" />
                </button>
              </div>
              {customer.notes && customer.notes.length > 0 ? (
                <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
                  {customer.notes.map((note: any) => (
                    <div key={note.id} className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          {note.is_pinned && (
                            <RiPushpin2Line className="w-3 h-3 text-amber-400 inline mr-1" />
                          )}
                          <span className="text-sm text-white">
                            {note.content}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        {formatDate(note.created_at)} - {note.note_type}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center">
                  <RiFileTextLine className="w-6 h-6 text-gray-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No notes yet</p>
                </div>
              )}
            </div>
          </div>

          {/* Additional Addresses */}
          {customer.addresses && customer.addresses.length > 0 && (
            <div className="relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500/10 via-purple-600/10 to-pink-500/10 rounded-2xl blur opacity-50" />
              <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
                <div className="h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />
                <div className="p-6 border-b border-white/10 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">
                    Other Addresses
                  </h2>
                  <button className="text-brand-400 hover:text-brand-300">
                    <RiAddLine className="w-5 h-5" />
                  </button>
                </div>
                <div className="divide-y divide-white/5">
                  {customer.addresses.map((address: any) => (
                    <div key={address.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-white">
                              {address.label || "Address"}
                            </p>
                            {address.is_default && (
                              <span className="px-2 py-0.5 bg-brand-500/20 text-brand-400 text-xs rounded-full">
                                Default
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-400">
                            {address.address_line1}
                          </p>
                          <p className="text-sm text-gray-400">
                            {address.city}, {address.state} {address.zip}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Customer Details */}
          <div className="relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-gray-500/10 via-gray-600/10 to-gray-500/10 rounded-2xl blur opacity-50" />
            <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
              <div className="h-px bg-gradient-to-r from-transparent via-gray-500/50 to-transparent" />
              <div className="p-6">
                <h2 className="text-lg font-semibold text-white mb-4">
                  Details
                </h2>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Source</span>
                    <span className="text-white capitalize">
                      {customer.source || "Unknown"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Created</span>
                    <span className="text-white">
                      {formatDate(customer.created_at)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Last Contact</span>
                    <span className="text-white">
                      {formatDate(customer.last_contact_at)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Portal</span>
                    <span
                      className={
                        customer.portal_enabled
                          ? "text-green-400"
                          : "text-gray-400"
                      }
                    >
                      {customer.portal_enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Preferred Contact</span>
                    <span className="text-white capitalize">
                      {customer.preferred_contact_method || "SMS"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
