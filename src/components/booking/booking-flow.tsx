"use client";

import { useState, useMemo } from "react";
import {
  RiCheckLine,
  RiSparklingLine,
  RiHome4Line,
  RiCalendarLine,
  RiUserLine,
  RiSecurePaymentLine,
  RiPhoneLine,
  RiMailLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/format";
import { ServiceSelection } from "./steps/service-selection";
import { PropertyDetails } from "./steps/property-details";
import { DateTimeSelection } from "./steps/date-time-selection";
import { ContactInfo } from "./steps/contact-info";
import { ReviewPayment } from "./steps/review-payment";
import { Confirmation } from "./steps/confirmation";

export interface BookingData {
  // Service
  serviceId: string;
  serviceName: string;
  
  // Property
  zip: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number | null;
  hasPets: boolean;
  petDetails: string;
  propertyType: string;
  
  // Schedule
  date: Date | null;
  time: string | null;
  
  // Contact
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  instructions: string;
  
  // Membership
  frequency: "onetime" | "weekly" | "biweekly" | "monthly";
  
  // Calculated
  basePrice: number;
  adjustments: { name: string; amount: number }[];
  subtotal: number;
  discount: number;
  total: number;
  deposit: number;
}

interface Service {
  id: string;
  name: string;
  description?: string;
  price_1bed?: number;
  price_2bed?: number;
  price_3bed?: number;
  price_4bed?: number;
  price_5bed_plus?: number;
  price_per_bathroom?: number;
  estimated_duration_minutes?: number;
  is_active?: boolean;
  display_order?: number;
}

interface Business {
  id: string;
  name: string;
  slug: string;
  phone: string;
  email: string;
  logo_url?: string;
  primary_color?: string;
  settings?: Record<string, unknown>;
}

interface Availability {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
}

interface BookingFlowProps {
  business: Business;
  services: Service[];
  serviceAreas: string[];
  availability: Availability[];
}

type Step = "service" | "property" | "datetime" | "contact" | "review" | "confirmation";

const STEPS: { key: Step; label: string; icon: typeof RiSparklingLine }[] = [
  { key: "service", label: "Service", icon: RiSparklingLine },
  { key: "property", label: "Property", icon: RiHome4Line },
  { key: "datetime", label: "Schedule", icon: RiCalendarLine },
  { key: "contact", label: "Contact", icon: RiUserLine },
  { key: "review", label: "Book", icon: RiSecurePaymentLine },
];

export function BookingFlow({ business, services, serviceAreas, availability }: BookingFlowProps) {
  const [step, setStep] = useState<Step>("service");
  const [bookingId, setBookingId] = useState<string | null>(null);

  // Form data
  const [data, setData] = useState<BookingData>({
    serviceId: "",
    serviceName: "",
    zip: "",
    bedrooms: 3,
    bathrooms: 2,
    sqft: null,
    hasPets: false,
    petDetails: "",
    propertyType: "house",
    date: null,
    time: null,
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    instructions: "",
    frequency: "onetime",
    basePrice: 0,
    adjustments: [],
    subtotal: 0,
    discount: 0,
    total: 0,
    deposit: 0,
  });

  // Brand color
  const brandColor = business.primary_color || "#6E47D1";

  // Calculate price whenever relevant fields change
  const selectedService = useMemo(
    () => services.find((s) => s.id === data.serviceId),
    [services, data.serviceId]
  );

  const calculatedPrice = useMemo(() => {
    if (!selectedService) return { basePrice: 0, adjustments: [], subtotal: 0, discount: 0, total: 0, deposit: 0 };

    // Base price from bedrooms
    const bedroomPrices: Record<number, number> = {
      1: selectedService.price_1bed || 100,
      2: selectedService.price_2bed || 120,
      3: selectedService.price_3bed || 140,
      4: selectedService.price_4bed || 180,
      5: selectedService.price_5bed_plus || 220,
    };

    let basePrice = bedroomPrices[Math.min(data.bedrooms, 5)] || 140;

    // Add bathroom price
    const bathroomPrice = (data.bathrooms - 1) * (selectedService.price_per_bathroom || 15);
    basePrice += bathroomPrice;

    // Adjustments
    const adjustments: { name: string; amount: number }[] = [];

    if (data.hasPets) {
      adjustments.push({ name: "Pet fee", amount: 20 });
    }

    const adjustmentTotal = adjustments.reduce((sum, a) => sum + a.amount, 0);
    const subtotal = basePrice + adjustmentTotal;

    // Frequency discount
    const discountRates: Record<string, number> = {
      onetime: 0,
      monthly: 0.05,
      biweekly: 0.10,
      weekly: 0.15,
    };

    const discountRate = discountRates[data.frequency] || 0;
    const discount = Math.round(subtotal * discountRate);
    const total = subtotal - discount;
    const deposit = Math.round(total * 0.25);

    return { basePrice, adjustments, subtotal, discount, total, deposit };
  }, [selectedService, data.bedrooms, data.bathrooms, data.hasPets, data.frequency]);

  // Update data helper
  const updateData = (updates: Partial<BookingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  // Navigation
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const nextStep = () => {
    const nextIndex = stepIndex + 1;
    if (nextIndex < STEPS.length) {
      setStep(STEPS[nextIndex].key);
      window.scrollTo(0, 0);
    }
  };

  const prevStep = () => {
    const prevIndex = stepIndex - 1;
    if (prevIndex >= 0) {
      setStep(STEPS[prevIndex].key);
      window.scrollTo(0, 0);
    }
  };

  const goToStep = (targetStep: Step) => {
    const targetIndex = STEPS.findIndex((s) => s.key === targetStep);
    if (targetIndex <= stepIndex) {
      setStep(targetStep);
      window.scrollTo(0, 0);
    }
  };

  // Handle booking completion
  const handleBookingComplete = (id: string) => {
    setBookingId(id);
    setStep("confirmation");
  };

  // Confirmation screen
  if (step === "confirmation") {
    return (
      <Confirmation
        business={business}
        data={data}
        bookingId={bookingId}
        brandColor={brandColor}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header
        className="sticky top-0 z-50 text-white"
        style={{ backgroundColor: brandColor }}
      >
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            {business.logo_url ? (
              <img
                src={business.logo_url}
                alt=""
                className="w-10 h-10 rounded-lg object-cover bg-white/10"
              />
            ) : (
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <RiSparklingLine className="w-5 h-5" />
              </div>
            )}
            <div>
              <h1 className="font-bold text-lg">{business.name}</h1>
              <p className="text-sm text-white/80">Book your cleaning</p>
            </div>
          </div>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-[72px] z-40">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => {
              const isComplete = i < stepIndex;
              const isCurrent = i === stepIndex;
              const isClickable = i <= stepIndex;

              return (
                <button
                  key={s.key}
                  onClick={() => isClickable && goToStep(s.key)}
                  disabled={!isClickable}
                  className={cn(
                    "flex items-center gap-2 transition-colors",
                    isClickable ? "cursor-pointer" : "cursor-default"
                  )}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all",
                      isComplete
                        ? "bg-green-500 text-white"
                        : isCurrent
                        ? "text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                    )}
                    style={isCurrent ? { backgroundColor: brandColor } : {}}
                  >
                    {isComplete ? <RiCheckLine className="w-4 h-4" /> : i + 1}
                  </div>
                  <span
                    className={cn(
                      "hidden sm:block text-sm font-medium",
                      isCurrent ? "text-gray-900 dark:text-gray-50" : "text-gray-500 dark:text-gray-400"
                    )}
                  >
                    {s.label}
                  </span>
                  {i < STEPS.length - 1 && (
                    <div
                      className={cn(
                        "hidden sm:block w-8 h-0.5 mx-2",
                        isComplete ? "bg-green-500" : "bg-gray-200 dark:bg-gray-700"
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Form Section */}
          <div className="lg:col-span-2">
            {step === "service" && (
              <ServiceSelection
                services={services}
                serviceAreas={serviceAreas}
                data={data}
                updateData={updateData}
                onNext={nextStep}
                brandColor={brandColor}
              />
            )}

            {step === "property" && (
              <PropertyDetails
                data={data}
                updateData={updateData}
                selectedService={selectedService}
                onNext={nextStep}
                onBack={prevStep}
                brandColor={brandColor}
              />
            )}

            {step === "datetime" && (
              <DateTimeSelection
                availability={availability}
                businessId={business.id}
                data={data}
                updateData={updateData}
                onNext={nextStep}
                onBack={prevStep}
                brandColor={brandColor}
              />
            )}

            {step === "contact" && (
              <ContactInfo
                data={data}
                updateData={updateData}
                onNext={nextStep}
                onBack={prevStep}
                brandColor={brandColor}
              />
            )}

            {step === "review" && (
              <ReviewPayment
                business={business}
                data={{ ...data, ...calculatedPrice }}
                selectedService={selectedService}
                onBack={prevStep}
                onComplete={handleBookingComplete}
                brandColor={brandColor}
              />
            )}
          </div>

          {/* Price Summary Sidebar */}
          {step !== "service" && (
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sticky top-[140px]">
                <h3 className="font-semibold text-gray-900 dark:text-gray-50 mb-4">Your Booking</h3>

                <div className="space-y-3 text-sm">
                  {/* Service */}
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Service</span>
                    <span className="font-medium text-gray-900 dark:text-gray-50">{data.serviceName || "—"}</span>
                  </div>

                  {/* Property */}
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Size</span>
                    <span className="text-gray-900 dark:text-gray-50">{data.bedrooms} bed / {data.bathrooms} bath</span>
                  </div>

                  {/* Date */}
                  {data.date && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Date</span>
                      <span className="text-gray-900 dark:text-gray-50">
                        {data.date.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  )}

                  {/* Time */}
                  {data.time && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Time</span>
                      <span className="text-gray-900 dark:text-gray-50">{formatTimeDisplay(data.time)}</span>
                    </div>
                  )}

                  {/* Frequency */}
                  {data.frequency !== "onetime" && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Frequency</span>
                      <span className="capitalize text-green-600 dark:text-green-400">{data.frequency}</span>
                    </div>
                  )}

                  {/* Divider */}
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                    {/* Base price */}
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Base price</span>
                      <span className="text-gray-900 dark:text-gray-50">{formatCurrency(calculatedPrice.basePrice)}</span>
                    </div>

                    {/* Adjustments */}
                    {calculatedPrice.adjustments.map((adj, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">{adj.name}</span>
                        <span className="text-gray-900 dark:text-gray-50">+{formatCurrency(adj.amount)}</span>
                      </div>
                    ))}

                    {/* Discount */}
                    {calculatedPrice.discount > 0 && (
                      <div className="flex justify-between text-green-600 dark:text-green-400">
                        <span>
                          {data.frequency === "weekly" && "Weekly discount (15%)"}
                          {data.frequency === "biweekly" && "Biweekly discount (10%)"}
                          {data.frequency === "monthly" && "Monthly discount (5%)"}
                        </span>
                        <span>-{formatCurrency(calculatedPrice.discount)}</span>
                      </div>
                    )}

                    {/* Total */}
                    <div className="flex justify-between font-semibold text-base pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
                      <span className="text-gray-900 dark:text-gray-50">Total</span>
                      <span style={{ color: brandColor }}>
                        {formatCurrency(calculatedPrice.total)}
                      </span>
                    </div>

                    {data.frequency !== "onetime" && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        per cleaning
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 mt-auto">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-center gap-6 text-sm text-gray-500 dark:text-gray-400">
            <a href={`tel:${business.phone}`} className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300">
              <RiPhoneLine className="w-4 h-4" />
              {business.phone}
            </a>
            <a href={`mailto:${business.email}`} className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300">
              <RiMailLine className="w-4 h-4" />
              Contact
            </a>
          </div>
          <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-2">
            Powered by{" "}
            <a href="https://vistrial.io" className="hover:text-gray-600 dark:hover:text-gray-300">
              Vistrial
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

// Helper
function formatTimeDisplay(time: string): string {
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}
