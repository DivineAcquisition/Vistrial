"use client";

import {
  RiCheckLine,
  RiCalendarLine,
  RiMapPinLine,
  RiPhoneLine,
  RiMailLine,
} from "@remixicon/react";
import { formatCurrency } from "@/lib/utils/format";
import { BookingData } from "../booking-flow";

interface Business {
  id: string;
  name: string;
  slug: string;
  phone: string;
  email: string;
}

interface ConfirmationProps {
  business: Business;
  data: BookingData;
  bookingId: string | null;
  brandColor: string;
}

export function Confirmation({
  business,
  data,
  brandColor,
}: ConfirmationProps) {
  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Success Card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg overflow-hidden">
          {/* Header */}
          <div
            className="p-6 text-white text-center"
            style={{ backgroundColor: brandColor }}
          >
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <RiCheckLine className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold">You&apos;re All Set!</h1>
            <p className="text-white/80 mt-1">
              Your cleaning has been scheduled
            </p>
          </div>

          {/* Booking Details */}
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <RiCalendarLine className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-50">
                  {data.date && formatDate(data.date)}
                </p>
                <p className="text-gray-500 dark:text-gray-400">{data.time && formatTime(data.time)}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <RiMapPinLine className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-50">{data.address}</p>
                <p className="text-gray-500 dark:text-gray-400">
                  {data.city}, {data.state} {data.zip}
                </p>
              </div>
            </div>

            {/* Price */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Total</span>
                <span className="font-semibold text-gray-900 dark:text-gray-50">{formatCurrency(data.total)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mt-1">
                <span>Deposit paid</span>
                <span>{formatCurrency(data.deposit)}</span>
              </div>
            </div>

            {/* Membership badge */}
            {data.frequency !== "onetime" && (
              <div
                className="p-3 rounded-xl text-center"
                style={{ backgroundColor: `${brandColor}10` }}
              >
                <p className="font-medium" style={{ color: brandColor }}>
                  🎉 {data.frequency.charAt(0).toUpperCase() + data.frequency.slice(1)} Membership Active
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Your next cleaning will be automatically scheduled
                </p>
              </div>
            )}

            {/* What's next */}
            <div className="pt-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-50 mb-2">What&apos;s next?</h3>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Confirmation text sent to {data.phone}
                </li>
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Reminder sent the day before
                </li>
                <li className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4 text-green-500" />
                  Pay remaining balance at cleaning
                </li>
              </ul>
            </div>
          </div>

          {/* Business Contact */}
          <div className="p-6 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Questions? Contact us:</p>
            <div className="flex items-center gap-4">
              <a
                href={`tel:${business.phone}`}
                className="flex items-center gap-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-50"
              >
                <RiPhoneLine className="w-4 h-4" />
                {business.phone}
              </a>
              <a
                href={`mailto:${business.email}`}
                className="flex items-center gap-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-50"
              >
                <RiMailLine className="w-4 h-4" />
                Email
              </a>
            </div>
          </div>
        </div>

        {/* Customer Portal Link */}
        <div className="text-center mt-6">
          <a
            href={`/portal/${business.slug}`}
            className="text-sm font-medium hover:underline"
            style={{ color: brandColor }}
          >
            Manage your booking in the customer portal →
          </a>
        </div>
      </div>
    </div>
  );
}
