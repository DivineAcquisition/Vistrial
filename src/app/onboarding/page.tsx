"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  RiBuilding2Line,
  RiPhoneLine,
  RiMapPinLine,
  RiCheckLine,
  RiArrowRightLine,
  RiArrowLeftLine,
  RiLoader4Line,
  RiSparklingLine,
  RiCheckboxCircleLine,
  RiUserLine,
  RiMailLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils/cn";

type Step = 1 | 2 | 3;

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    // Step 1: Business basics
    ownerName: "",
    businessName: "",
    businessType: "cleaning",
    // Step 2: Contact
    phone: "",
    email: "",
    // Step 3: Location (optional)
    address: "",
    city: "",
    state: "",
    zip: "",
  });

  // Check auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        
        if (!data.user) {
          router.push("/login");
          return;
        }
        
        setUserId(data.user.id);
        setUserEmail(data.user.email);
        
        // Pre-fill from user metadata
        if (data.user.user_metadata) {
          const meta = data.user.user_metadata;
          setFormData(prev => ({
            ...prev,
            ownerName: meta.full_name || meta.name || "",
            businessName: meta.business_name || "",
            phone: meta.phone || "",
            email: data.user.email || "",
          }));
        }
        
        // Check if already has completed business
        if (data.business?.onboarding_completed) {
          router.push("/dashboard");
        }
      } catch (err) {
        console.error("Auth check failed:", err);
      }
    };
    
    checkAuth();
  }, [router]);

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError("");
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    if (digits.length > 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length > 3) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    } else if (digits.length > 0) {
      return `(${digits}`;
    }
    return "";
  };

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return formData.ownerName.length >= 2 && formData.businessName.length >= 2;
      case 2:
        return formData.phone.replace(/\D/g, "").length >= 10;
      case 3:
        return true; // Optional
      default:
        return true;
    }
  };

  const handleComplete = async () => {
    if (!userId) {
      setError("Not authenticated. Please log in again.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          userEmail,
          ...formData,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to complete setup");
      }

      setSuccess(true);
      
      // Redirect after showing success
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (err) {
      console.error("Onboarding error:", err);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  // Success screen
  if (success) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        {/* Header */}
        <header className="p-6 border-b border-gray-100">
          <div className="max-w-4xl mx-auto">
            <Link href="/">
              <Image src="/VISTRIAL.png" alt="Vistrial" width={120} height={40} className="object-contain" />
            </Link>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center mx-auto mb-6">
              <RiCheckboxCircleLine className="w-10 h-10 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-3">You&apos;re all set!</h1>
            <p className="text-gray-500 mb-8">Your business is ready. Taking you to your dashboard...</p>
            <div className="flex items-center justify-center gap-2 text-brand-600">
              <RiLoader4Line className="w-5 h-5 animate-spin" />
              <span>Loading dashboard...</span>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="p-6 border-b border-gray-100 sticky top-0 bg-white/80 backdrop-blur-xl z-50">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/">
            <Image src="/VISTRIAL.png" alt="Vistrial" width={120} height={40} className="object-contain" />
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Step</span>
            <span className="px-2.5 py-1 text-xs font-semibold text-brand-700 bg-brand-100 rounded-full">
              {currentStep} of 3
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Progress bar */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-2">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all",
                    step < currentStep
                      ? "bg-brand-500 text-white"
                      : step === currentStep
                      ? "bg-brand-500 text-white ring-4 ring-brand-100"
                      : "bg-gray-100 text-gray-400"
                  )}
                >
                  {step < currentStep ? <RiCheckLine className="w-5 h-5" /> : step}
                </div>
                {step < 3 && (
                  <div
                    className={cn(
                      "w-24 sm:w-32 h-1 mx-2 rounded-full transition-all",
                      step < currentStep ? "bg-brand-500" : "bg-gray-100"
                    )}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-500 px-1">
            <span>Business</span>
            <span>Contact</span>
            <span>Location</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Step 1: Business Info */}
        {currentStep === 1 && (
          <div className="space-y-8">
            <div className="text-center">
              <div className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-100 text-brand-700 rounded-full text-sm font-medium mb-4">
                <RiSparklingLine className="w-4 h-4" />
                Get started
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Tell us about your business</h1>
              <p className="text-gray-500">This helps personalize your experience</p>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Your name</label>
                <div className="relative">
                  <RiUserLine className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.ownerName}
                    onChange={(e) => updateField("ownerName", e.target.value)}
                    placeholder="John Smith"
                    className="w-full h-12 pl-12 pr-4 border border-gray-200 rounded-xl focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Business name</label>
                <div className="relative">
                  <RiBuilding2Line className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.businessName}
                    onChange={(e) => updateField("businessName", e.target.value)}
                    placeholder="Sparkle Clean Co"
                    className="w-full h-12 pl-12 pr-4 border border-gray-200 rounded-xl focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Business type</label>
                <select
                  value={formData.businessType}
                  onChange={(e) => updateField("businessType", e.target.value)}
                  className="w-full h-12 px-4 border border-gray-200 rounded-xl focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 bg-white transition-all"
                >
                  <option value="cleaning">Cleaning Services</option>
                  <option value="plumbing">Plumbing</option>
                  <option value="electrical">Electrical</option>
                  <option value="hvac">HVAC</option>
                  <option value="landscaping">Landscaping</option>
                  <option value="painting">Painting</option>
                  <option value="handyman">Handyman</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Contact */}
        {currentStep === 2 && (
          <div className="space-y-8">
            <div className="text-center">
              <div className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-100 text-brand-700 rounded-full text-sm font-medium mb-4">
                <RiPhoneLine className="w-4 h-4" />
                Contact details
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">How can customers reach you?</h1>
              <p className="text-gray-500">This will appear on your booking page</p>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone number</label>
                <div className="relative">
                  <RiPhoneLine className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => updateField("phone", formatPhone(e.target.value))}
                    placeholder="(555) 123-4567"
                    className="w-full h-12 pl-12 pr-4 border border-gray-200 rounded-xl focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Business email <span className="text-gray-400">(optional)</span>
                </label>
                <div className="relative">
                  <RiMailLine className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    placeholder="hello@yourbusiness.com"
                    className="w-full h-12 pl-12 pr-4 border border-gray-200 rounded-xl focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Location */}
        {currentStep === 3 && (
          <div className="space-y-8">
            <div className="text-center">
              <div className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-100 text-brand-700 rounded-full text-sm font-medium mb-4">
                <RiMapPinLine className="w-4 h-4" />
                Almost done
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Where are you located?</h1>
              <p className="text-gray-500">Optional - you can add this later</p>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Street address</label>
                <div className="relative">
                  <RiMapPinLine className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => updateField("address", e.target.value)}
                    placeholder="123 Main Street"
                    className="w-full h-12 pl-12 pr-4 border border-gray-200 rounded-xl focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => updateField("city", e.target.value)}
                    placeholder="City"
                    className="w-full h-12 px-4 border border-gray-200 rounded-xl focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => updateField("state", e.target.value.toUpperCase())}
                    placeholder="CA"
                    maxLength={2}
                    className="w-full h-12 px-4 border border-gray-200 rounded-xl focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">ZIP</label>
                  <input
                    type="text"
                    value={formData.zip}
                    onChange={(e) => updateField("zip", e.target.value)}
                    placeholder="90210"
                    maxLength={10}
                    className="w-full h-12 px-4 border border-gray-200 rounded-xl focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-12 pt-8 border-t border-gray-100">
          {currentStep > 1 ? (
            <button
              onClick={() => setCurrentStep((currentStep - 1) as Step)}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium transition-colors"
            >
              <RiArrowLeftLine className="w-4 h-4" />
              Back
            </button>
          ) : (
            <div />
          )}

          {currentStep < 3 ? (
            <button
              onClick={() => setCurrentStep((currentStep + 1) as Step)}
              disabled={!isStepValid()}
              className="group relative flex items-center gap-2 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white px-8 py-3 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30 hover:scale-[1.02] active:scale-[0.98] before:absolute before:inset-[1px] before:rounded-[10px] before:border before:border-white/20 before:border-b-transparent before:border-r-transparent before:pointer-events-none"
            >
              Continue
              <RiArrowRightLine className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          ) : (
            <button
              onClick={handleComplete}
              disabled={loading}
              className="group relative flex items-center gap-2 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white px-8 py-3 rounded-xl font-semibold disabled:opacity-50 transition-all shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30 hover:scale-[1.02] active:scale-[0.98] before:absolute before:inset-[1px] before:rounded-[10px] before:border before:border-white/20 before:border-b-transparent before:border-r-transparent before:pointer-events-none"
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

        {/* Skip link */}
        <div className="text-center mt-6">
          <button
            onClick={handleComplete}
            disabled={loading || currentStep === 1}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            Skip for now
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 text-center text-sm text-gray-400 border-t border-gray-100">
        © {new Date().getFullYear()} Vistrial. All rights reserved.
      </footer>
    </div>
  );
}
