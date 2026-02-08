// @ts-nocheck
"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  RiBuilding2Line,
  RiPhoneLine,
  RiMapPinLine,
  RiPaletteLine,
  RiCheckLine,
  RiArrowRightLine,
  RiArrowLeftLine,
  RiLoader4Line,
  RiSparklingLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";

type Step = "business" | "contact" | "branding" | "complete";

const steps = [
  { id: "business", name: "Business Info", icon: RiBuilding2Line },
  { id: "contact", name: "Contact Details", icon: RiPhoneLine },
  { id: "branding", name: "Branding", icon: RiPaletteLine },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>("business");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    // Business
    businessName: "",
    businessType: "",
    // Contact
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    // Branding
    primaryColor: "#5347D1",
    tagline: "",
  });

  // Create Supabase client lazily to avoid SSR issues
  const supabase = useMemo(() => {
    if (typeof window === "undefined") return null;
    return createClient();
  }, []);

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const getCurrentStepIndex = () => {
    return steps.findIndex((s) => s.id === currentStep);
  };

  const goToNextStep = () => {
    const currentIndex = getCurrentStepIndex();
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1].id as Step);
    }
  };

  const goToPrevStep = () => {
    const currentIndex = getCurrentStepIndex();
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1].id as Step);
    }
  };

  const handleComplete = async () => {
    if (!supabase) {
      setError("Unable to connect. Please refresh the page.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        console.error("Auth error:", userError);
        window.location.href = "/login";
        return;
      }

      // Use the setup-organization API to create org + membership
      const response = await fetch("/api/auth/setup-organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.businessName,
          business_type: formData.businessType || "other",
          user_id: user.id,
          first_name: user.user_metadata?.first_name || formData.businessName.split(" ")[0],
          last_name: user.user_metadata?.last_name || "",
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create organization");
      }

      setCurrentStep("complete");

      // Hard navigation to dashboard
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 2000);
    } catch (err: any) {
      console.error("Onboarding error:", err);
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const isStepValid = () => {
    switch (currentStep) {
      case "business":
        return formData.businessName.length >= 2 && formData.businessType.length > 0;
      case "contact":
        return formData.phone.length >= 10;
      case "branding":
        return true; // Optional step
      default:
        return true;
    }
  };

  if (currentStep === "complete") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <RiCheckLine className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">You&apos;re all set!</h1>
          <p className="text-slate-500 mb-6">
            Your business profile has been created. Redirecting you to your dashboard...
          </p>
          <div className="flex items-center justify-center gap-2 text-brand-600">
            <RiLoader4Line className="w-5 h-5 animate-spin" />
            <span>Loading dashboard...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
      {/* Header */}
      <header className="p-6">
        <Link href="/" className="inline-block">
          <Image
            src="/vsds.png"
            alt="Vistrial"
            width={140}
            height={48}
            className="object-contain"
            priority
          />
        </Link>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          {/* Progress steps */}
          <div className="mb-8">
            <div className="flex items-center justify-between relative">
              {/* Progress line */}
              <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-slate-200 -translate-y-1/2" />
              <div 
                className="absolute left-0 top-1/2 h-0.5 bg-brand-500 -translate-y-1/2 transition-all duration-300"
                style={{ width: `${(getCurrentStepIndex() / (steps.length - 1)) * 100}%` }}
              />
              
              {steps.map((step, index) => {
                const isCompleted = index < getCurrentStepIndex();
                const isCurrent = step.id === currentStep;
                
                return (
                  <div key={step.id} className="relative z-10 flex flex-col items-center">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300",
                        isCompleted
                          ? "bg-brand-500 text-gray-900"
                          : isCurrent
                          ? "bg-brand-500 text-gray-900 ring-4 ring-brand-100"
                          : "bg-white text-slate-400 border-2 border-slate-200"
                      )}
                    >
                      {isCompleted ? (
                        <RiCheckLine className="w-5 h-5" />
                      ) : (
                        <step.icon className="w-5 h-5" />
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-xs mt-2 font-medium",
                        isCurrent ? "text-brand-600" : "text-slate-400"
                      )}
                    >
                      {step.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Form card */}
          <div className="bg-white rounded-2xl shadow-xl p-8">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}

            {/* Business Info Step */}
            {currentStep === "business" && (
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Tell us about your business</h2>
                <p className="text-slate-500 mb-6">This helps us customize your experience.</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Business name
                    </label>
                    <div className="relative">
                      <RiBuilding2Line className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="text"
                        value={formData.businessName}
                        onChange={(e) => updateField("businessName", e.target.value)}
                        placeholder="Sparkle Clean Co"
                        className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Business type
                    </label>
                    <select
                      value={formData.businessType}
                      onChange={(e) => updateField("businessType", e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 bg-white"
                    >
                      <option value="">Select your industry</option>
                      <option value="cleaning_residential">Residential Cleaning</option>
                      <option value="cleaning_commercial">Commercial Cleaning</option>
                      <option value="plumbing">Plumbing</option>
                      <option value="electrical">Electrical</option>
                      <option value="hvac">HVAC</option>
                      <option value="landscaping">Landscaping</option>
                      <option value="painting">Painting</option>
                      <option value="roofing">Roofing</option>
                      <option value="pest_control">Pest Control</option>
                      <option value="handyman">Handyman</option>
                      <option value="carpet_cleaning">Carpet Cleaning</option>
                      <option value="window_cleaning">Window Cleaning</option>
                      <option value="pressure_washing">Pressure Washing</option>
                      <option value="pool_service">Pool Service</option>
                      <option value="appliance_repair">Appliance Repair</option>
                      <option value="junk_removal">Junk Removal</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Contact Details Step */}
            {currentStep === "contact" && (
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Contact information</h2>
                <p className="text-slate-500 mb-6">How can your customers reach you?</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Phone number
                    </label>
                    <div className="relative">
                      <RiPhoneLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => updateField("phone", e.target.value)}
                        placeholder="+1 (555) 123-4567"
                        className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Business address
                    </label>
                    <div className="relative">
                      <RiMapPinLine className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                      <input
                        type="text"
                        value={formData.address}
                        onChange={(e) => updateField("address", e.target.value)}
                        placeholder="123 Main Street"
                        className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        City
                      </label>
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => updateField("city", e.target.value)}
                        placeholder="City"
                        className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        State
                      </label>
                      <input
                        type="text"
                        value={formData.state}
                        onChange={(e) => updateField("state", e.target.value)}
                        placeholder="CA"
                        maxLength={2}
                        className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        ZIP
                      </label>
                      <input
                        type="text"
                        value={formData.zip}
                        onChange={(e) => updateField("zip", e.target.value)}
                        placeholder="90210"
                        maxLength={10}
                        className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Branding Step */}
            {currentStep === "branding" && (
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Customize your brand</h2>
                <p className="text-slate-500 mb-6">Make your booking page feel like yours.</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Brand color
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={formData.primaryColor}
                        onChange={(e) => updateField("primaryColor", e.target.value)}
                        className="w-12 h-12 rounded-lg cursor-pointer border border-slate-200"
                      />
                      <input
                        type="text"
                        value={formData.primaryColor}
                        onChange={(e) => updateField("primaryColor", e.target.value)}
                        className="flex-1 px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Tagline (optional)
                    </label>
                    <input
                      type="text"
                      value={formData.tagline}
                      onChange={(e) => updateField("tagline", e.target.value)}
                      placeholder="Quality service you can trust"
                      className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900"
                    />
                  </div>

                  {/* Preview */}
                  <div className="mt-6 p-4 rounded-xl border border-slate-200 bg-slate-50">
                    <p className="text-xs text-slate-500 mb-3">Preview</p>
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-gray-900 font-bold text-xl"
                        style={{ backgroundColor: formData.primaryColor }}
                      >
                        {formData.businessName?.[0]?.toUpperCase() || "B"}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">
                          {formData.businessName || "Your Business"}
                        </p>
                        {formData.tagline && (
                          <p className="text-sm text-slate-500">{formData.tagline}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
              {getCurrentStepIndex() > 0 ? (
                <button
                  onClick={goToPrevStep}
                  className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium"
                >
                  <RiArrowLeftLine className="w-4 h-4" />
                  Back
                </button>
              ) : (
                <div />
              )}

              {getCurrentStepIndex() < steps.length - 1 ? (
                <button
                  onClick={goToNextStep}
                  disabled={!isStepValid()}
                  className="flex items-center gap-2 bg-brand-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Continue
                  <RiArrowRightLine className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleComplete}
                  disabled={loading}
                  className="flex items-center gap-2 bg-brand-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? (
                    <>
                      <RiLoader4Line className="w-5 h-5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <RiSparklingLine className="w-4 h-4" />
                      Complete Setup
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Skip link */}
          <div className="text-center mt-6">
            <Link
              href="/dashboard"
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              Skip for now
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} Vistrial. All rights reserved.
      </footer>
    </div>
  );
}
