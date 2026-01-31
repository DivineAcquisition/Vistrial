"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import {
  RiArrowRightLine,
  RiArrowLeftLine,
  RiCheckLine,
  RiToolsLine,
  RiTempColdLine,
  RiFlashlightLine,
  RiHome4Line,
  RiPlantLine,
  RiBrush2Line,
  RiSettings3Line,
  RiBugLine,
  RiBuilding2Line,
  RiLoader4Line,
  RiSparklingLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils/cn";

interface OnboardingData {
  trade: string;
  businessName: string;
  ownerName: string;
  phone: string;
}

const TRADE_OPTIONS = [
  { id: "plumbing", label: "Plumbing", icon: RiToolsLine, color: "from-blue-500 to-blue-600" },
  { id: "hvac", label: "HVAC", icon: RiTempColdLine, color: "from-cyan-500 to-cyan-600" },
  { id: "electrical", label: "Electrical", icon: RiFlashlightLine, color: "from-yellow-500 to-yellow-600" },
  { id: "cleaning", label: "Cleaning", icon: RiHome4Line, color: "from-green-500 to-green-600" },
  { id: "landscaping", label: "Landscaping", icon: RiPlantLine, color: "from-emerald-500 to-emerald-600" },
  { id: "painting", label: "Painting", icon: RiBrush2Line, color: "from-pink-500 to-pink-600" },
  { id: "handyman", label: "Handyman", icon: RiSettings3Line, color: "from-orange-500 to-orange-600" },
  { id: "pest_control", label: "Pest Control", icon: RiBugLine, color: "from-red-500 to-red-600" },
  { id: "other", label: "Other", icon: RiBuilding2Line, color: "from-violet-500 to-violet-600" },
];

const STEPS = [
  { id: 1, title: "Industry", description: "What type of business?" },
  { id: 2, title: "Business", description: "Tell us about you" },
  { id: 3, title: "Complete", description: "You're all set!" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<OnboardingData>({
    trade: "",
    businessName: "",
    ownerName: "",
    phone: "",
  });

  const selectedTrade = TRADE_OPTIONS.find((t) => t.id === data.trade);

  const canProceed = () => {
    if (currentStep === 1) return data.trade !== "";
    if (currentStep === 2) return data.businessName.trim() !== "" && data.ownerName.trim() !== "";
    return true;
  };

  const handleNext = async () => {
    if (currentStep === 2) {
      // Submit data before going to step 3
      setIsLoading(true);
      try {
        const response = await fetch("/api/onboarding/simple", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          throw new Error("Failed to complete onboarding");
        }

        setCurrentStep(3);
      } catch (error) {
        console.error("Onboarding error:", error);
        // Still proceed to show completion
        setCurrentStep(3);
      } finally {
        setIsLoading(false);
      }
    } else {
      setCurrentStep((prev) => Math.min(prev + 1, 3));
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleComplete = () => {
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-brand-400/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="px-6 py-6">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <Logo size="sm" variant="dark" showText={true} />
            
            {/* Progress indicator */}
            <div className="flex items-center gap-2">
              {STEPS.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300",
                      currentStep > step.id
                        ? "bg-green-500 text-white"
                        : currentStep === step.id
                        ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-lg shadow-brand-500/30"
                        : "bg-gray-200 text-gray-500"
                    )}
                  >
                    {currentStep > step.id ? (
                      <RiCheckLine className="w-4 h-4" />
                    ) : (
                      step.id
                    )}
                  </div>
                  {index < STEPS.length - 1 && (
                    <div
                      className={cn(
                        "w-12 h-0.5 mx-1 transition-all duration-300",
                        currentStep > step.id ? "bg-green-500" : "bg-gray-200"
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-xl">
            {/* Step 1: Trade Selection */}
            {currentStep === 1 && (
              <div className="space-y-8 animate-fade-in">
                <div className="text-center space-y-2">
                  <h1 className="text-3xl font-bold text-gray-900">
                    What type of business do you run?
                  </h1>
                  <p className="text-gray-500">
                    We&apos;ll customize your experience based on your industry
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {TRADE_OPTIONS.map((trade) => (
                    <button
                      key={trade.id}
                      onClick={() => setData((prev) => ({ ...prev, trade: trade.id }))}
                      className={cn(
                        "relative p-4 rounded-2xl border-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
                        data.trade === trade.id
                          ? "border-brand-500 bg-brand-50 shadow-lg shadow-brand-500/20"
                          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-md"
                      )}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div
                          className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center transition-all",
                            data.trade === trade.id
                              ? `bg-gradient-to-br ${trade.color} text-white shadow-lg`
                              : "bg-gray-100 text-gray-500"
                          )}
                        >
                          <trade.icon className="w-6 h-6" />
                        </div>
                        <span
                          className={cn(
                            "text-sm font-medium",
                            data.trade === trade.id ? "text-brand-700" : "text-gray-700"
                          )}
                        >
                          {trade.label}
                        </span>
                      </div>
                      {data.trade === trade.id && (
                        <div className="absolute top-2 right-2 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center">
                          <RiCheckLine className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Business Details */}
            {currentStep === 2 && (
              <div className="space-y-8 animate-fade-in">
                <div className="text-center space-y-2">
                  <div className="flex items-center justify-center gap-2 mb-4">
                    {selectedTrade && (
                      <div
                        className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-lg",
                          selectedTrade.color
                        )}
                      >
                        <selectedTrade.icon className="w-5 h-5 text-white" />
                      </div>
                    )}
                  </div>
                  <h1 className="text-3xl font-bold text-gray-900">
                    Tell us about your business
                  </h1>
                  <p className="text-gray-500">
                    Just a few details to get you started
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 shadow-xl shadow-gray-200/50 p-6 space-y-5">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Business Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={data.businessName}
                      onChange={(e) =>
                        setData((prev) => ({ ...prev, businessName: e.target.value }))
                      }
                      placeholder="e.g., Pro Plumbing LLC"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Your Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={data.ownerName}
                      onChange={(e) =>
                        setData((prev) => ({ ...prev, ownerName: e.target.value }))
                      }
                      placeholder="e.g., John Smith"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Phone Number <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="tel"
                      value={data.phone}
                      onChange={(e) =>
                        setData((prev) => ({ ...prev, phone: e.target.value }))
                      }
                      placeholder="(555) 123-4567"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Complete */}
            {currentStep === 3 && (
              <div className="space-y-8 animate-fade-in">
                <div className="text-center space-y-4">
                  <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto shadow-xl shadow-green-500/30">
                    <RiCheckLine className="w-10 h-10 text-white" />
                  </div>
                  <h1 className="text-3xl font-bold text-gray-900">
                    You&apos;re all set!
                  </h1>
                  <p className="text-gray-500 max-w-md mx-auto">
                    Your account has been created. Let&apos;s start growing your business.
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 shadow-xl shadow-gray-200/50 p-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">Business</span>
                      <span className="font-medium text-gray-900">{data.businessName}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">Industry</span>
                      <span className="font-medium text-gray-900">{selectedTrade?.label}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-gray-500">Owner</span>
                      <span className="font-medium text-gray-900">{data.ownerName}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleComplete}
                  className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-xl font-semibold text-lg hover:from-brand-600 hover:to-brand-700 transition-all shadow-xl shadow-brand-500/25 hover:shadow-2xl hover:shadow-brand-500/30 hover:scale-[1.01] active:scale-[0.99]"
                >
                  <RiSparklingLine className="w-5 h-5" />
                  Go to Dashboard
                  <RiArrowRightLine className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Navigation buttons (for steps 1 and 2) */}
            {currentStep < 3 && (
              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={handleBack}
                  disabled={currentStep === 1}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all",
                    currentStep === 1
                      ? "text-gray-300 cursor-not-allowed"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  )}
                >
                  <RiArrowLeftLine className="w-4 h-4" />
                  Back
                </button>

                <button
                  onClick={handleNext}
                  disabled={!canProceed() || isLoading}
                  className={cn(
                    "flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all",
                    canProceed() && !isLoading
                      ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white hover:from-brand-600 hover:to-brand-700 shadow-lg shadow-brand-500/25 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  )}
                >
                  {isLoading ? (
                    <>
                      <RiLoader4Line className="w-4 h-4 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      Continue
                      <RiArrowRightLine className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="px-6 py-4">
          <p className="text-center text-sm text-gray-400">
            © {new Date().getFullYear()} Vistrial. All rights reserved.
          </p>
        </footer>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}
