"use client";

import { useState } from "react";
import {
  RiArrowLeftSLine,
  RiSecurePaymentLine,
  RiLockLine,
  RiCalendarLine,
  RiMapPinLine,
  RiUserLine,
  RiSparklingLine,
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

interface ReviewPaymentProps {
  business: Business;
  data: BookingData;
  selectedService: unknown;
  onBack: () => void;
  onComplete: (bookingId: string) => void;
  brandColor: string;
}

export function ReviewPayment({
  business,
  data,
  onBack,
  onComplete,
  brandColor,
}: ReviewPaymentProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [agreed, setAgreed] = useState(false);

  // In production, you'd integrate Stripe Elements here
  // For now, we'll create the booking directly
  const handleSubmit = async () => {
    if (!agreed) {
      setError("Please agree to the terms to continue");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: business.id,
          serviceTypeId: data.serviceId,
          scheduledDate: data.date?.toISOString().split("T")[0],
          scheduledTime: data.time,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          email: data.email,
          address: data.address,
          city: data.city,
          state: data.state,
          zip: data.zip,
          bedrooms: data.bedrooms,
          bathrooms: data.bathrooms,
          sqft: data.sqft,
          hasPets: data.hasPets,
          instructions: data.instructions,
          frequency: data.frequency,
          subtotal: data.subtotal,
          discount: data.discount,
          total: data.total,
          deposit: data.deposit,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        onComplete(result.bookingId);
      } else {
        setError(result.error || "Something went wrong. Please try again.");
      }
    } catch {
      setError("Failed to complete booking. Please try again.");
    }

    setLoading(false);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
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
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Review & Book</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Please confirm your booking details</p>
      </div>

      {/* Booking Summary Card */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        {/* Service */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${brandColor}20` }}
            >
              <RiSparklingLine className="w-5 h-5" style={{ color: brandColor }} />
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-50">{data.serviceName}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {data.bedrooms} bed · {data.bathrooms} bath
                {data.hasPets && " · Has pets"}
              </p>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          <div className="p-4 flex items-start gap-3">
            <RiCalendarLine className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-50">
                {data.date && formatDate(data.date)}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {data.time && formatTime(data.time)}
              </p>
            </div>
          </div>

          <div className="p-4 flex items-start gap-3">
            <RiMapPinLine className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-50">{data.address}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {data.city}, {data.state} {data.zip}
              </p>
            </div>
          </div>

          <div className="p-4 flex items-start gap-3">
            <RiUserLine className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-50">
                {data.firstName} {data.lastName}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{data.phone}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{data.email}</p>
            </div>
          </div>

          {data.instructions && (
            <div className="p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <strong className="text-gray-700 dark:text-gray-300">Notes:</strong> {data.instructions}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Price Breakdown */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <h3 className="font-semibold text-gray-900 dark:text-gray-50 mb-3">Payment Summary</h3>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Service ({data.serviceName})</span>
            <span className="text-gray-900 dark:text-gray-50">{formatCurrency(data.basePrice)}</span>
          </div>

          {data.adjustments?.map((adj, i) => (
            <div key={i} className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">{adj.name}</span>
              <span className="text-gray-900 dark:text-gray-50">+{formatCurrency(adj.amount)}</span>
            </div>
          ))}

          {data.discount > 0 && (
            <div className="flex justify-between text-green-600 dark:text-green-400">
              <span>
                {data.frequency === "weekly" && "Weekly discount (15%)"}
                {data.frequency === "biweekly" && "Biweekly discount (10%)"}
                {data.frequency === "monthly" && "Monthly discount (5%)"}
              </span>
              <span>-{formatCurrency(data.discount)}</span>
            </div>
          )}

          <div className="flex justify-between font-semibold text-base pt-2 border-t border-gray-200 dark:border-gray-700">
            <span className="text-gray-900 dark:text-gray-50">Total</span>
            <span className="text-gray-900 dark:text-gray-50">{formatCurrency(data.total)}</span>
          </div>
        </div>

        {/* Deposit info */}
        <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-medium text-amber-900 dark:text-amber-300">Due today (deposit)</p>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Remaining {formatCurrency(data.total - data.deposit)} due at cleaning
              </p>
            </div>
            <p className="text-xl font-bold text-amber-900 dark:text-amber-300">
              {formatCurrency(data.deposit)}
            </p>
          </div>
        </div>

        {/* Membership info */}
        {data.frequency !== "onetime" && (
          <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
            <p className="text-sm text-green-800 dark:text-green-300">
              <strong>Recurring {data.frequency} cleaning:</strong> Your card will be
              charged {formatCurrency(data.total)} for each scheduled cleaning. You can
              pause or cancel anytime from your customer portal.
            </p>
          </div>
        )}
      </div>

      {/* Payment Form Placeholder */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <RiSecurePaymentLine className="w-5 h-5 text-gray-400" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-50">Payment Method</h3>
        </div>

        {/* Stripe Elements would go here */}
        <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center">
          <RiLockLine className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Secure payment powered by Stripe
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Card details collected securely at checkout
          </p>
        </div>
      </div>

      {/* Terms */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="w-5 h-5 mt-0.5 rounded text-brand-600"
        />
        <span className="text-sm text-gray-600 dark:text-gray-400">
          I agree to the{" "}
          <a href="#" className="text-brand-600 dark:text-brand-400 hover:underline">
            terms of service
          </a>{" "}
          and{" "}
          <a href="#" className="text-brand-600 dark:text-brand-400 hover:underline">
            cancellation policy
          </a>
          .
        </span>
      </label>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={onBack}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-6 py-3 border border-gray-200 dark:border-gray-700 rounded-xl font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          <RiArrowLeftSLine className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading || !agreed}
          className="flex-1 py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ backgroundColor: brandColor }}
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <RiLockLine className="w-4 h-4" />
              Pay {formatCurrency(data.deposit)} & Book
            </>
          )}
        </button>
      </div>
    </div>
  );
}
