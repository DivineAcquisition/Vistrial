"use client";

import { useState, useEffect } from "react";
import { RiCheckLine, RiMapPinLine, RiAlertLine } from "@remixicon/react";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/format";
import { BookingData } from "../booking-flow";

interface Service {
  id: string;
  name: string;
  description?: string;
  price_1bed?: number;
  estimated_duration_minutes?: number;
}

interface ServiceSelectionProps {
  services: Service[];
  serviceAreas: string[];
  data: BookingData;
  updateData: (updates: Partial<BookingData>) => void;
  onNext: () => void;
  brandColor: string;
}

export function ServiceSelection({
  services,
  serviceAreas,
  data,
  updateData,
  onNext,
  brandColor,
}: ServiceSelectionProps) {
  const [zipError, setZipError] = useState<string | null>(null);
  const [zipValid, setZipValid] = useState<boolean | null>(null);

  // Validate zip code
  useEffect(() => {
    if (data.zip.length === 5) {
      // If no service areas defined, accept all zips
      if (serviceAreas.length === 0) {
        setZipValid(true);
        setZipError(null);
      } else if (serviceAreas.includes(data.zip)) {
        setZipValid(true);
        setZipError(null);
      } else {
        setZipValid(false);
        setZipError("Sorry, we don't service this area yet.");
      }
    } else {
      setZipValid(null);
      setZipError(null);
    }
  }, [data.zip, serviceAreas]);

  const canProceed = data.serviceId && data.zip.length === 5 && zipValid !== false;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Select a Service</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Choose the type of cleaning you need</p>
      </div>

      {/* Service Cards */}
      <div className="space-y-3">
        {services.map((service) => {
          const isSelected = data.serviceId === service.id;
          const startingPrice = service.price_1bed || 100;

          return (
            <button
              key={service.id}
              onClick={() =>
                updateData({
                  serviceId: service.id,
                  serviceName: service.name,
                })
              }
              className={cn(
                "w-full p-4 rounded-xl border-2 text-left transition-all",
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
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-50">{service.name}</h3>
                    {isSelected && (
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: brandColor }}
                      >
                        <RiCheckLine className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                  {service.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{service.description}</p>
                  )}
                  {service.estimated_duration_minutes && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                      ~{Math.round(service.estimated_duration_minutes / 60)} hours
                    </p>
                  )}
                </div>
                <div className="text-right ml-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Starting at</p>
                  <p className="text-lg font-bold" style={{ color: brandColor }}>
                    {formatCurrency(startingPrice)}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Zip Code */}
      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Your Zip Code
        </label>
        <div className="relative">
          <RiMapPinLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            value={data.zip}
            onChange={(e) => updateData({ zip: e.target.value.replace(/\D/g, "") })}
            placeholder="Enter zip code"
            className={cn(
              "w-full pl-10 pr-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-50",
              zipError
                ? "border-red-300 dark:border-red-700 focus:ring-red-500"
                : zipValid
                ? "border-green-300 dark:border-green-700 focus:ring-green-500"
                : "border-gray-200 dark:border-gray-700 focus:ring-brand-500"
            )}
          />
          {zipValid && (
            <RiCheckLine className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
          )}
        </div>
        {zipError && (
          <p className="flex items-center gap-1 text-red-500 text-sm mt-2">
            <RiAlertLine className="w-4 h-4" />
            {zipError}
          </p>
        )}
        {zipValid && (
          <p className="text-green-600 dark:text-green-400 text-sm mt-2">✓ Great, we service your area!</p>
        )}
      </div>

      {/* Continue Button */}
      <button
        onClick={onNext}
        disabled={!canProceed}
        className="w-full py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: brandColor }}
      >
        Continue
      </button>
    </div>
  );
}
