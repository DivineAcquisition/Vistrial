"use client";

import { RiArrowLeftSLine } from "@remixicon/react";
import { cn } from "@/lib/utils/cn";
import { BookingData } from "../booking-flow";

interface PropertyDetailsProps {
  data: BookingData;
  updateData: (updates: Partial<BookingData>) => void;
  selectedService: unknown;
  onNext: () => void;
  onBack: () => void;
  brandColor: string;
}

const FREQUENCIES = [
  { value: "weekly", label: "Weekly", discount: "15% off", badge: "Best Value" },
  { value: "biweekly", label: "Biweekly", discount: "10% off", badge: "Popular" },
  { value: "monthly", label: "Monthly", discount: "5% off", badge: null },
  { value: "onetime", label: "One-time", discount: null, badge: null },
];

export function PropertyDetails({
  data,
  updateData,
  onNext,
  onBack,
  brandColor,
}: PropertyDetailsProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Property Details</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Tell us about your home</p>
      </div>

      {/* Bedrooms & Bathrooms */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Bedrooms
          </label>
          <select
            value={data.bedrooms}
            onChange={(e) => updateData({ bedrooms: Number(e.target.value) })}
            className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-50"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} {n === 5 ? "+" : ""} bedroom{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Bathrooms
          </label>
          <select
            value={data.bathrooms}
            onChange={(e) => updateData({ bathrooms: Number(e.target.value) })}
            className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-50"
          >
            {[1, 1.5, 2, 2.5, 3, 3.5, 4].map((n) => (
              <option key={n} value={n}>
                {n} bath{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Pets */}
      <div>
        <label className="flex items-center gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors bg-white dark:bg-gray-900">
          <input
            type="checkbox"
            checked={data.hasPets}
            onChange={(e) => updateData({ hasPets: e.target.checked })}
            className="w-5 h-5 rounded text-brand-600"
          />
          <div className="flex-1">
            <span className="font-medium text-gray-900 dark:text-gray-50">I have pets</span>
            <p className="text-sm text-gray-500 dark:text-gray-400">+$20 for extra pet hair cleanup</p>
          </div>
        </label>
      </div>

      {/* Frequency Selection - THE UPSELL */}
      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          How often do you need cleaning?
        </label>
        <div className="grid grid-cols-2 gap-3">
          {FREQUENCIES.map((freq) => {
            const isSelected = data.frequency === freq.value;
            return (
              <button
                key={freq.value}
                onClick={() => updateData({ frequency: freq.value as BookingData["frequency"] })}
                className={cn(
                  "relative p-4 rounded-xl border-2 text-left transition-all",
                  isSelected
                    ? "bg-brand-50 dark:bg-brand-900/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-900"
                )}
                style={
                  isSelected
                    ? { borderColor: brandColor, backgroundColor: `${brandColor}10` }
                    : {}
                }
              >
                {freq.badge && (
                  <span
                    className="absolute -top-2 right-2 px-2 py-0.5 text-xs font-medium text-white rounded-full"
                    style={{ backgroundColor: freq.badge === "Best Value" ? "#10b981" : brandColor }}
                  >
                    {freq.badge}
                  </span>
                )}
                <p className="font-semibold text-gray-900 dark:text-gray-50">{freq.label}</p>
                {freq.discount ? (
                  <p className="text-sm text-green-600 dark:text-green-400 mt-1">{freq.discount}</p>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">No discount</p>
                )}
              </button>
            );
          })}
        </div>

        {data.frequency !== "onetime" && (
          <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
            <p className="text-sm text-green-800 dark:text-green-300">
              🎉 <strong>Great choice!</strong> You&apos;ll save{" "}
              {data.frequency === "weekly" ? "15%" : data.frequency === "biweekly" ? "10%" : "5%"}{" "}
              on every cleaning with {data.frequency} service.
            </p>
          </div>
        )}
      </div>

      {/* Buttons */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={onBack}
          className="flex items-center justify-center gap-2 px-6 py-3 border border-gray-200 dark:border-gray-700 rounded-xl font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <RiArrowLeftSLine className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={onNext}
          className="flex-1 py-3 rounded-xl font-semibold text-white transition-all"
          style={{ backgroundColor: brandColor }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
