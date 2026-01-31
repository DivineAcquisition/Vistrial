"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { createClient } from "@/lib/supabase/client";
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
  RiMapPinLine,
  RiTimeLine,
  RiGlobalLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils/cn";
import { completeOnboarding, updateOnboardingStep } from "@/lib/auth/actions";

interface Business {
  id: string;
  name: string;
  slug: string;
  onboarding_step: number;
  trade?: string;
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
  { id: 1, title: "Industry", icon: RiBuilding2Line },
  { id: 2, title: "Service Area", icon: RiMapPinLine },
  { id: 3, title: "Availability", icon: RiTimeLine },
  { id: 4, title: "Go Live", icon: RiGlobalLine },
];

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [error, setError] = useState("");
  const [business, setBusiness] = useState<Business | null>(null);
  
  const [data, setData] = useState({
    trade: "",
    zipCodes: [] as string[],
    newZipCode: "",
  });

  const totalSteps = STEPS.length;

  // Check authentication and load business on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          router.push("/signup");
          return;
        }
        
        // Get user's business
        const { data: membership } = await supabase
          .from("business_users")
          .select("business_id, businesses(*)")
          .eq("user_id", user.id)
          .single();
        
        if (membership?.businesses) {
          const biz = membership.businesses as Business;
          setBusiness(biz);
          setData(prev => ({
            ...prev,
            trade: biz.trade || "",
          }));
          setCurrentStep(biz.onboarding_step || 1);
        }
      } catch (err) {
        console.error("Auth check error:", err);
      }
      
      setIsCheckingAuth(false);
    }
    
    checkAuth();
  }, [supabase, router]);

  const canProceed = () => {
    switch (currentStep) {
      case 1: return data.trade !== "";
      case 2: return true; // Optional
      case 3: return true; // Optional
      default: return true;
    }
  };

  const handleNext = async () => {
    setError("");
    setIsLoading(true);

    if (!business) {
      setError("No business found");
      setIsLoading(false);
      return;
    }

    // Save trade selection
    if (currentStep === 1 && data.trade) {
      await supabase
        .from("businesses")
        .update({ trade: data.trade })
        .eq("id", business.id);
    }

    // Save step progress
    const nextStep = currentStep + 1;
    await updateOnboardingStep(business.id, nextStep);
    
    if (currentStep === totalSteps) {
      await completeOnboarding(business.id);
      router.push("/dashboard");
    } else {
      setCurrentStep(nextStep);
    }
    
    setIsLoading(false);
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = async () => {
    if (!business) return;
    await completeOnboarding(business.id);
    router.push("/dashboard");
  };

  const addZipCode = () => {
    if (data.newZipCode && !data.zipCodes.includes(data.newZipCode)) {
      setData(prev => ({
        ...prev,
        zipCodes: [...prev.zipCodes, prev.newZipCode],
        newZipCode: "",
      }));
    }
  };

  const removeZipCode = (zip: string) => {
    setData(prev => ({
      ...prev,
      zipCodes: prev.zipCodes.filter(z => z !== zip),
    }));
  };

  // Show loading while checking auth
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <RiLoader4Line className="w-8 h-8 animate-spin text-violet-600 mx-auto mb-4" />
          <p className="text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Logo size="sm" variant="dark" showText={true} />
          <button
            onClick={handleSkip}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Skip for now
          </button>
        </div>
      </header>

      {/* Progress */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                  currentStep > s.id
                    ? "bg-green-500 text-white"
                    : currentStep === s.id
                    ? "bg-violet-600 text-white"
                    : "bg-slate-200 text-slate-500"
                )}
              >
                {currentStep > s.id ? (
                  <RiCheckLine className="w-5 h-5" />
                ) : (
                  <s.icon className="w-5 h-5" />
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "w-12 sm:w-20 lg:w-32 h-1 mx-2",
                    currentStep > s.id ? "bg-green-500" : "bg-slate-200"
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-xl border p-6 md:p-8">
          
          {/* Step 1: Industry */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold text-slate-900 mb-2">
                  What type of business do you run?
                </h2>
                <p className="text-slate-500">
                  We&apos;ll customize your experience based on your industry
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {TRADE_OPTIONS.map((trade) => (
                  <button
                    key={trade.id}
                    onClick={() => setData((prev) => ({ ...prev, trade: trade.id }))}
                    className={cn(
                      "relative p-4 rounded-xl border-2 transition-all hover:scale-[1.02] active:scale-[0.98]",
                      data.trade === trade.id
                        ? "border-violet-500 bg-violet-50 shadow-lg"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    )}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div
                        className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center transition-all",
                          data.trade === trade.id
                            ? `bg-gradient-to-br ${trade.color} text-white shadow-lg`
                            : "bg-slate-100 text-slate-500"
                        )}
                      >
                        <trade.icon className="w-5 h-5" />
                      </div>
                      <span
                        className={cn(
                          "text-sm font-medium",
                          data.trade === trade.id ? "text-violet-700" : "text-slate-700"
                        )}
                      >
                        {trade.label}
                      </span>
                    </div>
                    {data.trade === trade.id && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-violet-500 rounded-full flex items-center justify-center">
                        <RiCheckLine className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Service Area */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold text-slate-900 mb-2">
                  Where do you provide service?
                </h2>
                <p className="text-slate-500">
                  Add zip codes to let customers know if you service their area
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={data.newZipCode}
                  onChange={(e) => setData(prev => ({ ...prev, newZipCode: e.target.value }))}
                  placeholder="Enter zip code"
                  maxLength={10}
                  className="flex-1 px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-900"
                  onKeyDown={(e) => e.key === "Enter" && addZipCode()}
                />
                <button
                  onClick={addZipCode}
                  className="px-6 py-3 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700"
                >
                  Add
                </button>
              </div>

              {data.zipCodes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {data.zipCodes.map((zip) => (
                    <span
                      key={zip}
                      className="inline-flex items-center gap-2 px-3 py-1 bg-violet-100 text-violet-700 rounded-full text-sm"
                    >
                      {zip}
                      <button
                        onClick={() => removeZipCode(zip)}
                        className="hover:text-violet-900"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <p className="text-sm text-slate-500 text-center">
                You can add more zip codes later in settings
              </p>
            </div>
          )}

          {/* Step 3: Availability */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold text-slate-900 mb-2">
                  Set your availability
                </h2>
                <p className="text-slate-500">
                  Default hours are Mon-Fri 8AM-5PM. You can customize this later.
                </p>
              </div>

              <div className="bg-slate-50 rounded-lg p-6">
                <div className="space-y-3">
                  {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => (
                    <div key={day} className="flex items-center justify-between">
                      <span className="font-medium text-slate-700">{day}</span>
                      <span className="text-slate-500">8:00 AM - 5:00 PM</span>
                    </div>
                  ))}
                  {["Saturday", "Sunday"].map((day) => (
                    <div key={day} className="flex items-center justify-between">
                      <span className="font-medium text-slate-400">{day}</span>
                      <span className="text-slate-400">Closed</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-sm text-slate-500 text-center">
                You can customize your availability in settings
              </p>
            </div>
          )}

          {/* Step 4: Go Live */}
          {currentStep === 4 && (
            <div className="text-center py-8 space-y-6">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <RiSparklingLine className="w-10 h-10 text-green-600" />
              </div>
              
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 mb-2">
                  You&apos;re all set!
                </h2>
                <p className="text-slate-500 max-w-md mx-auto">
                  Your booking page is ready. Share it with customers to start receiving bookings.
                </p>
              </div>

              {business && (
                <div className="bg-slate-50 rounded-lg p-4 inline-block">
                  <p className="text-sm text-slate-500 mb-1">Your booking page</p>
                  <a
                    href={`https://book.vistrial.io/${business.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-600 font-medium hover:underline"
                  >
                    book.vistrial.io/{business.slug}
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <button
            onClick={handleBack}
            disabled={currentStep === 1}
            className="flex items-center gap-2 px-6 py-3 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RiArrowLeftLine className="w-4 h-4" />
            Back
          </button>
          <button
            onClick={handleNext}
            disabled={isLoading || !canProceed()}
            className="flex items-center gap-2 px-6 py-3 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <RiLoader4Line className="w-5 h-5 animate-spin" />
            ) : currentStep === totalSteps ? (
              "Go to Dashboard"
            ) : (
              <>
                Continue
                <RiArrowRightLine className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
