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
  RiCalendarLine,
  RiFileTextLine,
  RiMessage2Line,
  RiDashboardLine,
  RiUserLine,
  RiBarChart2Line,
  RiTimeLine,
  RiMoneyDollarCircleLine,
  RiRefreshLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils/cn";

interface OnboardingData {
  trade: string;
  businessName: string;
  ownerName: string;
  phone: string;
  monthlyQuotes: string;
  goals: string[];
  primaryFeature: string;
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

const VOLUME_OPTIONS = [
  { id: "1-10", label: "1-10", sublabel: "Just starting out" },
  { id: "11-25", label: "11-25", sublabel: "Growing steadily" },
  { id: "26-50", label: "26-50", sublabel: "Established business" },
  { id: "50+", label: "50+", sublabel: "High volume" },
];

const GOAL_OPTIONS = [
  { id: "more_bookings", label: "Get more bookings", icon: RiCalendarLine },
  { id: "better_followup", label: "Better quote follow-up", icon: RiMessage2Line },
  { id: "recurring_revenue", label: "Build recurring revenue", icon: RiRefreshLine },
  { id: "save_time", label: "Save time on admin", icon: RiTimeLine },
  { id: "track_revenue", label: "Track revenue better", icon: RiBarChart2Line },
  { id: "professional_image", label: "Look more professional", icon: RiUserLine },
];

const FEATURE_OPTIONS = [
  { 
    id: "booking", 
    label: "Online Booking Page", 
    description: "Let customers book directly from your website",
    icon: RiCalendarLine,
    color: "from-brand-500 to-brand-600"
  },
  { 
    id: "quotes", 
    label: "Quote Follow-ups", 
    description: "Automated SMS reminders for pending quotes",
    icon: RiFileTextLine,
    color: "from-green-500 to-green-600"
  },
  { 
    id: "dashboard", 
    label: "Business Dashboard", 
    description: "Track bookings, revenue, and customers",
    icon: RiDashboardLine,
    color: "from-blue-500 to-blue-600"
  },
];

const STEPS = [
  { id: 1, title: "Industry" },
  { id: 2, title: "Business" },
  { id: 3, title: "Volume" },
  { id: 4, title: "Goals" },
  { id: 5, title: "Features" },
  { id: 6, title: "Complete" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  
  const [data, setData] = useState<OnboardingData>({
    trade: "",
    businessName: "",
    ownerName: "",
    phone: "",
    monthlyQuotes: "",
    goals: [],
    primaryFeature: "",
  });

  const selectedTrade = TRADE_OPTIONS.find((t) => t.id === data.trade);
  const totalSteps = STEPS.length;

  // Check authentication and load existing data on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          router.push("/signup");
          return;
        }
        
        setUserId(user.id);
        setUserEmail(user.email || "");
        
        // Load existing profile data if available
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        
        if (profile) {
          // Pre-fill data from profile
          setData(prev => ({
            ...prev,
            businessName: profile.business_name || user.user_metadata?.business_name || "",
            ownerName: profile.full_name || user.user_metadata?.full_name || "",
            phone: profile.phone || user.user_metadata?.phone || "",
            trade: profile.trade || "",
          }));
          
          // If onboarding already completed, redirect to dashboard
          if (profile.onboarding_completed) {
            router.push("/dashboard");
            return;
          }
        } else {
          // No profile yet - use user metadata
          setData(prev => ({
            ...prev,
            businessName: user.user_metadata?.business_name || "",
            ownerName: user.user_metadata?.full_name || "",
            phone: user.user_metadata?.phone || "",
          }));
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
      case 2: return data.businessName.trim() !== "" && data.ownerName.trim() !== "";
      case 3: return data.monthlyQuotes !== "";
      case 4: return data.goals.length > 0;
      case 5: return data.primaryFeature !== "";
      default: return true;
    }
  };

  const handleNext = async () => {
    setError("");
    
    if (currentStep === 5) {
      // Submit data and complete onboarding
      setIsLoading(true);
      
      try {
        const slug = data.businessName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .substring(0, 50);

        // Update profile with all onboarding data
        const { error: updateError } = await supabase
          .from("profiles")
          .upsert({
            id: userId,
            email: userEmail,
            full_name: data.ownerName,
            business_name: data.businessName,
            business_slug: slug,
            phone: data.phone || null,
            trade: data.trade,
            monthly_quotes: data.monthlyQuotes,
            goals: data.goals,
            primary_feature: data.primaryFeature,
            onboarding_completed: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: "id" });

        if (updateError) {
          console.error("Profile update error:", updateError);
          setError("Failed to save your information. Please try again.");
          setIsLoading(false);
          return;
        }

        setCurrentStep(6);
      } catch (err) {
        console.error("Onboarding error:", err);
        setError("An error occurred. Please try again.");
      }
      
      setIsLoading(false);
    } else {
      setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleComplete = () => {
    router.push("/dashboard");
  };

  const toggleGoal = (goalId: string) => {
    setData((prev) => ({
      ...prev,
      goals: prev.goals.includes(goalId)
        ? prev.goals.filter((g) => g !== goalId)
        : [...prev.goals, goalId],
    }));
  };

  // Show loading while checking auth
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <RiLoader4Line className="w-8 h-8 animate-spin text-brand-500 mx-auto mb-4" />
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

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
        <header className="px-4 md:px-6 py-4 md:py-6">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <Logo size="sm" variant="dark" showText={true} />
            
            {/* Progress bar */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 mr-2 hidden sm:inline">
                Step {currentStep} of {totalSteps}
              </span>
              <div className="flex gap-1">
                {STEPS.map((step) => (
                  <div
                    key={step.id}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      step.id <= currentStep
                        ? "w-4 md:w-6 bg-gradient-to-r from-brand-500 to-brand-600"
                        : "w-1.5 md:w-2 bg-gray-200"
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 flex items-center justify-center px-4 md:px-6 py-6 md:py-12">
          <div className="w-full max-w-2xl">
            
            {/* Step 1: Trade Selection */}
            {currentStep === 1 && (
              <div className="space-y-6 md:space-y-8 animate-fade-in">
                <div className="text-center space-y-2">
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                    What type of business do you run?
                  </h1>
                  <p className="text-sm md:text-base text-gray-500">
                    We&apos;ll customize Vistrial for your industry
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 md:gap-3">
                  {TRADE_OPTIONS.map((trade) => (
                    <button
                      key={trade.id}
                      onClick={() => setData((prev) => ({ ...prev, trade: trade.id }))}
                      className={cn(
                        "relative p-3 md:p-4 rounded-xl md:rounded-2xl border-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
                        data.trade === trade.id
                          ? "border-brand-500 bg-brand-50 shadow-lg shadow-brand-500/20"
                          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-md"
                      )}
                    >
                      <div className="flex flex-col items-center gap-1.5 md:gap-2">
                        <div
                          className={cn(
                            "w-10 h-10 md:w-12 md:h-12 rounded-lg md:rounded-xl flex items-center justify-center transition-all",
                            data.trade === trade.id
                              ? `bg-gradient-to-br ${trade.color} text-white shadow-lg`
                              : "bg-gray-100 text-gray-500"
                          )}
                        >
                          <trade.icon className="w-5 h-5 md:w-6 md:h-6" />
                        </div>
                        <span
                          className={cn(
                            "text-xs md:text-sm font-medium",
                            data.trade === trade.id ? "text-brand-700" : "text-gray-700"
                          )}
                        >
                          {trade.label}
                        </span>
                      </div>
                      {data.trade === trade.id && (
                        <div className="absolute top-1.5 right-1.5 md:top-2 md:right-2 w-4 h-4 md:w-5 md:h-5 bg-brand-500 rounded-full flex items-center justify-center">
                          <RiCheckLine className="w-2.5 h-2.5 md:w-3 md:h-3 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Business Details */}
            {currentStep === 2 && (
              <div className="space-y-6 md:space-y-8 animate-fade-in">
                <div className="text-center space-y-2">
                  <div className="flex items-center justify-center gap-2 mb-3 md:mb-4">
                    {selectedTrade && (
                      <div
                        className={cn(
                          "w-9 h-9 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center bg-gradient-to-br shadow-lg",
                          selectedTrade.color
                        )}
                      >
                        <selectedTrade.icon className="w-4 h-4 md:w-5 md:h-5 text-white" />
                      </div>
                    )}
                  </div>
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                    Tell us about your business
                  </h1>
                  <p className="text-sm md:text-base text-gray-500">
                    This helps us personalize your experience
                  </p>
                </div>

                <div className="bg-white rounded-xl md:rounded-2xl border border-gray-200 shadow-xl shadow-gray-200/50 p-4 md:p-6 space-y-4 md:space-y-5">
                  <div className="space-y-1.5 md:space-y-2">
                    <label className="block text-xs md:text-sm font-medium text-gray-700">
                      Business Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={data.businessName}
                      onChange={(e) =>
                        setData((prev) => ({ ...prev, businessName: e.target.value }))
                      }
                      placeholder="e.g., Pro Plumbing LLC"
                      className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm bg-gray-50 border border-gray-200 rounded-lg md:rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                    />
                  </div>

                  <div className="space-y-1.5 md:space-y-2">
                    <label className="block text-xs md:text-sm font-medium text-gray-700">
                      Your Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={data.ownerName}
                      onChange={(e) =>
                        setData((prev) => ({ ...prev, ownerName: e.target.value }))
                      }
                      placeholder="e.g., John Smith"
                      className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm bg-gray-50 border border-gray-200 rounded-lg md:rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                    />
                  </div>

                  <div className="space-y-1.5 md:space-y-2">
                    <label className="block text-xs md:text-sm font-medium text-gray-700">
                      Phone Number <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="tel"
                      value={data.phone}
                      onChange={(e) =>
                        setData((prev) => ({ ...prev, phone: e.target.value }))
                      }
                      placeholder="(555) 123-4567"
                      className="w-full px-3 md:px-4 py-2.5 md:py-3 text-sm bg-gray-50 border border-gray-200 rounded-lg md:rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Volume */}
            {currentStep === 3 && (
              <div className="space-y-6 md:space-y-8 animate-fade-in">
                <div className="text-center space-y-2">
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                    How many quotes do you send monthly?
                  </h1>
                  <p className="text-sm md:text-base text-gray-500">
                    This helps us recommend the right features
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 md:gap-4">
                  {VOLUME_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setData((prev) => ({ ...prev, monthlyQuotes: option.id }))}
                      className={cn(
                        "relative p-4 md:p-6 rounded-xl md:rounded-2xl border-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] text-left",
                        data.monthlyQuotes === option.id
                          ? "border-brand-500 bg-brand-50 shadow-lg shadow-brand-500/20"
                          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-md"
                      )}
                    >
                      <div className="space-y-1">
                        <p className={cn(
                          "text-2xl md:text-3xl font-bold",
                          data.monthlyQuotes === option.id ? "text-brand-600" : "text-gray-900"
                        )}>
                          {option.label}
                        </p>
                        <p className="text-xs md:text-sm text-gray-500">
                          {option.sublabel}
                        </p>
                      </div>
                      {data.monthlyQuotes === option.id && (
                        <div className="absolute top-2 right-2 md:top-3 md:right-3 w-5 h-5 md:w-6 md:h-6 bg-brand-500 rounded-full flex items-center justify-center">
                          <RiCheckLine className="w-3 h-3 md:w-4 md:h-4 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex gap-3">
                    <RiMoneyDollarCircleLine className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">Did you know?</p>
                      <p className="text-xs md:text-sm text-amber-700">
                        Businesses that follow up on quotes within 24 hours close 60% more deals.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Goals */}
            {currentStep === 4 && (
              <div className="space-y-6 md:space-y-8 animate-fade-in">
                <div className="text-center space-y-2">
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                    What are your main goals?
                  </h1>
                  <p className="text-sm md:text-base text-gray-500">
                    Select all that apply
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 md:gap-3">
                  {GOAL_OPTIONS.map((goal) => (
                    <button
                      key={goal.id}
                      onClick={() => toggleGoal(goal.id)}
                      className={cn(
                        "relative p-3 md:p-4 rounded-xl border-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] text-left",
                        data.goals.includes(goal.id)
                          ? "border-brand-500 bg-brand-50"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      )}
                    >
                      <div className="flex items-center gap-2 md:gap-3">
                        <div
                          className={cn(
                            "w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                            data.goals.includes(goal.id)
                              ? "bg-brand-500 text-white"
                              : "bg-gray-100 text-gray-500"
                          )}
                        >
                          <goal.icon className="w-4 h-4 md:w-5 md:h-5" />
                        </div>
                        <span className={cn(
                          "text-xs md:text-sm font-medium",
                          data.goals.includes(goal.id) ? "text-brand-700" : "text-gray-700"
                        )}>
                          {goal.label}
                        </span>
                      </div>
                      {data.goals.includes(goal.id) && (
                        <div className="absolute top-1.5 right-1.5 md:top-2 md:right-2 w-4 h-4 md:w-5 md:h-5 bg-brand-500 rounded-full flex items-center justify-center">
                          <RiCheckLine className="w-2.5 h-2.5 md:w-3 md:h-3 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 5: Feature Selection */}
            {currentStep === 5 && (
              <div className="space-y-6 md:space-y-8 animate-fade-in">
                <div className="text-center space-y-2">
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                    What would you like to set up first?
                  </h1>
                  <p className="text-sm md:text-base text-gray-500">
                    You can use all features - this helps us guide you
                  </p>
                </div>

                <div className="space-y-3">
                  {FEATURE_OPTIONS.map((feature) => (
                    <button
                      key={feature.id}
                      onClick={() => setData((prev) => ({ ...prev, primaryFeature: feature.id }))}
                      className={cn(
                        "relative w-full p-4 md:p-5 rounded-xl md:rounded-2xl border-2 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] text-left",
                        data.primaryFeature === feature.id
                          ? "border-brand-500 bg-brand-50 shadow-lg shadow-brand-500/20"
                          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-md"
                      )}
                    >
                      <div className="flex items-center gap-3 md:gap-4">
                        <div
                          className={cn(
                            "w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center flex-shrink-0",
                            data.primaryFeature === feature.id
                              ? `bg-gradient-to-br ${feature.color} text-white shadow-lg`
                              : "bg-gray-100 text-gray-500"
                          )}
                        >
                          <feature.icon className="w-6 h-6 md:w-7 md:h-7" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm md:text-base font-semibold",
                            data.primaryFeature === feature.id ? "text-brand-700" : "text-gray-900"
                          )}>
                            {feature.label}
                          </p>
                          <p className="text-xs md:text-sm text-gray-500 mt-0.5">
                            {feature.description}
                          </p>
                        </div>
                        {data.primaryFeature === feature.id && (
                          <div className="w-6 h-6 bg-brand-500 rounded-full flex items-center justify-center flex-shrink-0">
                            <RiCheckLine className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 6: Complete */}
            {currentStep === 6 && (
              <div className="space-y-6 md:space-y-8 animate-fade-in">
                <div className="text-center space-y-3 md:space-y-4">
                  <div className="w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto shadow-xl shadow-green-500/30">
                    <RiCheckLine className="w-8 h-8 md:w-10 md:h-10 text-white" />
                  </div>
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                    Welcome to Vistrial, {data.ownerName.split(" ")[0]}!
                  </h1>
                  <p className="text-sm md:text-base text-gray-500 max-w-md mx-auto">
                    Your account is all set up. Let&apos;s get started!
                  </p>
                </div>

                {/* Summary Card */}
                <div className="bg-white rounded-xl md:rounded-2xl border border-gray-200 shadow-xl shadow-gray-200/50 overflow-hidden">
                  <div className="p-4 md:p-5 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-center gap-2">
                      <RiCheckLine className="w-5 h-5 text-green-600" />
                      <p className="text-sm font-medium text-gray-700">Account Ready</p>
                    </div>
                  </div>
                  <div className="p-4 md:p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Email</span>
                      <span className="text-sm font-medium text-gray-900">{userEmail}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Business</span>
                      <span className="text-sm font-medium text-gray-900">{data.businessName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Industry</span>
                      <span className="text-sm font-medium text-gray-900">{selectedTrade?.label}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleComplete}
                  className="relative w-full flex items-center justify-center gap-2 px-6 py-3 md:py-4 bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-xl font-semibold text-base md:text-lg hover:from-brand-600 hover:to-brand-700 transition-all shadow-xl shadow-brand-500/25 hover:shadow-2xl hover:shadow-brand-500/30 hover:scale-[1.01] active:scale-[0.99]"
                >
                  <RiSparklingLine className="w-5 h-5" />
                  Go to Dashboard
                  <RiArrowRightLine className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                {error}
              </div>
            )}

            {/* Navigation buttons */}
            {currentStep < 6 && (
              <div className="mt-6 md:mt-8 flex items-center justify-between">
                <button
                  onClick={handleBack}
                  disabled={currentStep === 1}
                  className={cn(
                    "flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg md:rounded-xl text-sm font-medium transition-all",
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
                    "relative flex items-center gap-2 px-5 md:px-6 py-2.5 md:py-3 rounded-lg md:rounded-xl text-sm font-medium transition-all",
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
                  ) : currentStep === 5 ? (
                    <>
                      Complete Setup
                      <RiCheckLine className="w-4 h-4" />
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
        <footer className="px-4 md:px-6 py-3 md:py-4">
          <p className="text-center text-xs text-gray-400">
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
