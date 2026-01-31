"use client";

import { useState, useEffect, useRef } from "react";
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
  RiMailLine,
  RiShieldCheckLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils/cn";

interface OnboardingData {
  email: string;
  verificationCode: string;
  isVerified: boolean;
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
  { id: 1, title: "Verify" },
  { id: 2, title: "Industry" },
  { id: 3, title: "Business" },
  { id: 4, title: "Volume" },
  { id: 5, title: "Goals" },
  { id: 6, title: "Features" },
  { id: 7, title: "Complete" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [codeResendTimer, setCodeResendTimer] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  
  const [data, setData] = useState<OnboardingData>({
    email: "",
    verificationCode: "",
    isVerified: false,
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

  // Check authentication on mount
  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        setUserId(user.id);
        setData(prev => ({ ...prev, email: user.email || "" }));
        // If user is already authenticated, they might have verified email
        // Check if email is verified
        if (user.email_confirmed_at) {
          setData(prev => ({ ...prev, isVerified: true }));
          setCurrentStep(2); // Skip to industry selection
        }
      }
      
      setIsCheckingAuth(false);
    }
    
    checkAuth();
  }, []);

  // Resend timer countdown
  useEffect(() => {
    if (codeResendTimer > 0) {
      const timer = setTimeout(() => setCodeResendTimer(codeResendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [codeResendTimer]);

  // Handle verification code input
  const handleCodeInput = (index: number, value: string) => {
    if (value.length > 1) {
      value = value[0];
    }
    
    if (!/^\d*$/.test(value)) return;
    
    const newCode = data.verificationCode.split("");
    newCode[index] = value;
    const updatedCode = newCode.join("").substring(0, 6);
    
    setData(prev => ({ ...prev, verificationCode: updatedCode }));
    
    // Auto-focus next input
    if (value && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }
    
    // Auto-verify when all 6 digits entered
    if (updatedCode.length === 6) {
      verifyCode(updatedCode);
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !data.verificationCode[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").substring(0, 6);
    setData(prev => ({ ...prev, verificationCode: pastedData }));
    
    if (pastedData.length === 6) {
      verifyCode(pastedData);
    } else {
      codeInputRefs.current[pastedData.length]?.focus();
    }
  };

  const sendVerificationCode = async () => {
    if (!data.email) {
      setError("Please enter your email address");
      return;
    }

    setIsSendingCode(true);
    setError("");

    try {
      const response = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: data.email,
          businessName: data.businessName || undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to send code");
      }

      setCodeSent(true);
      setCodeResendTimer(60); // 60 second cooldown
      
      // For development, show the code
      if (result.devCode) {
        console.log("DEV: Verification code:", result.devCode);
      }
    } catch (err) {
      console.error("Send code error:", err);
      setError(err instanceof Error ? err.message : "Failed to send verification code");
    } finally {
      setIsSendingCode(false);
    }
  };

  const verifyCode = async (code: string) => {
    setIsVerifying(true);
    setError("");

    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: data.email,
          code,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Invalid code");
      }

      setData(prev => ({ ...prev, isVerified: true }));
      
      // Move to next step after short delay to show success
      setTimeout(() => {
        setCurrentStep(2);
      }, 500);
    } catch (err) {
      console.error("Verify error:", err);
      setError(err instanceof Error ? err.message : "Invalid verification code");
      setData(prev => ({ ...prev, verificationCode: "" }));
    } finally {
      setIsVerifying(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: return data.isVerified;
      case 2: return data.trade !== "";
      case 3: return data.businessName.trim() !== "" && data.ownerName.trim() !== "";
      case 4: return data.monthlyQuotes !== "";
      case 5: return data.goals.length > 0;
      case 6: return data.primaryFeature !== "";
      default: return true;
    }
  };

  const handleNext = async () => {
    setError("");
    
    if (currentStep === 6) {
      // Submit data before going to completion
      setIsLoading(true);
      let success = false;
      
      try {
        const response = await fetch("/api/onboarding/simple", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            ...data,
            goals: data.goals,
            userId,
          }),
        });

        const result = await response.json();
        console.log("Onboarding API response:", result);
        
        if (response.ok && (result.businessCreated || result.profileUpdated)) {
          success = true;
        }
      } catch (err) {
        console.error("API error:", err);
      }

      // If API failed, try direct Supabase update as fallback
      if (!success && userId) {
        try {
          const supabase = createClient();
          const slug = data.businessName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .substring(0, 50);

          const { error: profileError } = await supabase
            .from("profiles")
            .upsert({
              id: userId,
              email: data.email,
              business_name: data.businessName,
              business_slug: slug,
              business_phone: data.phone || null,
              onboarding_completed: true,
              email_verified: true,
              updated_at: new Date().toISOString(),
            }, { onConflict: "id" });

          if (!profileError) {
            console.log("Profile updated via client");
            success = true;
          } else {
            console.error("Client profile update error:", profileError);
          }
        } catch (clientErr) {
          console.error("Client fallback error:", clientErr);
        }
      }

      // Mark completion in localStorage
      localStorage.setItem("onboarding_completed", "true");
      localStorage.setItem("onboarding_user_id", userId || "");
      localStorage.setItem("onboarding_email_verified", "true");
      localStorage.setItem("onboarding_business_name", data.businessName);
      localStorage.removeItem("onboarding_data");
      
      if (!success) {
        setError("Setup saved locally. You may need to complete setup in settings.");
      }
      
      setIsLoading(false);
      setCurrentStep(7);
    } else {
      setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
    }
  };

  const handleBack = () => {
    // Don't go back past verification if verified
    if (currentStep === 2 && data.isVerified) {
      return;
    }
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleComplete = () => {
    router.push("/dashboard?onboarding=complete");
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
            
            {/* Step 1: Email Verification */}
            {currentStep === 1 && (
              <div className="space-y-6 md:space-y-8 animate-fade-in">
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 bg-gradient-to-br from-brand-400 to-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-brand-500/30">
                    {data.isVerified ? (
                      <RiShieldCheckLine className="w-8 h-8 text-white" />
                    ) : (
                      <RiMailLine className="w-8 h-8 text-white" />
                    )}
                  </div>
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                    {data.isVerified ? "Email Verified!" : "Verify your email"}
                  </h1>
                  <p className="text-sm md:text-base text-gray-500 max-w-md mx-auto">
                    {data.isVerified 
                      ? "Your email has been verified. Let's continue setting up your account."
                      : "We'll send you a 6-digit code to verify your email address."
                    }
                  </p>
                </div>

                {!data.isVerified && (
                  <div className="bg-white rounded-xl md:rounded-2xl border border-gray-200 shadow-xl shadow-gray-200/50 p-5 md:p-6 space-y-5">
                    {!codeSent ? (
                      <>
                        {/* Email Input */}
                        <div className="space-y-2">
                          <label className="block text-xs md:text-sm font-medium text-gray-700">
                            Email Address
                          </label>
                          <div className="relative">
                            <RiMailLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                              type="email"
                              value={data.email}
                              onChange={(e) => setData(prev => ({ ...prev, email: e.target.value }))}
                              placeholder="you@example.com"
                              className="w-full pl-10 pr-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                            />
                          </div>
                        </div>

                        <button
                          onClick={sendVerificationCode}
                          disabled={!data.email || isSendingCode}
                          className={cn(
                            "relative w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all",
                            data.email && !isSendingCode
                              ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white hover:from-brand-600 hover:to-brand-700 shadow-lg shadow-brand-500/25 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]"
                              : "bg-gray-200 text-gray-400 cursor-not-allowed"
                          )}
                        >
                          {isSendingCode ? (
                            <>
                              <RiLoader4Line className="w-4 h-4 animate-spin" />
                              Sending code...
                            </>
                          ) : (
                            <>
                              Send Verification Code
                              <RiArrowRightLine className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      </>
                    ) : (
                      <>
                        {/* Code Input */}
                        <div className="text-center space-y-4">
                          <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                            <RiMailLine className="w-4 h-4" />
                            Code sent to <span className="font-medium">{data.email}</span>
                          </div>

                          {/* 6-digit code input */}
                          <div className="flex justify-center gap-2 md:gap-3" onPaste={handleCodePaste}>
                            {[0, 1, 2, 3, 4, 5].map((index) => (
                              <input
                                key={index}
                                ref={(el) => { codeInputRefs.current[index] = el; }}
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                value={data.verificationCode[index] || ""}
                                onChange={(e) => handleCodeInput(index, e.target.value)}
                                onKeyDown={(e) => handleCodeKeyDown(index, e)}
                                className={cn(
                                  "w-10 h-12 md:w-12 md:h-14 text-center text-lg md:text-xl font-bold rounded-lg border-2 transition-all focus:outline-none",
                                  data.verificationCode[index]
                                    ? "border-brand-500 bg-brand-50 text-brand-700"
                                    : "border-gray-200 bg-gray-50 text-gray-900",
                                  "focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                                )}
                              />
                            ))}
                          </div>

                          {isVerifying && (
                            <div className="flex items-center justify-center gap-2 text-brand-600">
                              <RiLoader4Line className="w-4 h-4 animate-spin" />
                              Verifying...
                            </div>
                          )}

                          {/* Resend code */}
                          <div className="pt-4">
                            {codeResendTimer > 0 ? (
                              <p className="text-sm text-gray-500">
                                Resend code in {codeResendTimer}s
                              </p>
                            ) : (
                              <button
                                onClick={sendVerificationCode}
                                disabled={isSendingCode}
                                className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                              >
                                Didn&apos;t receive the code? Resend
                              </button>
                            )}
                          </div>

                          <button
                            onClick={() => {
                              setCodeSent(false);
                              setData(prev => ({ ...prev, verificationCode: "" }));
                            }}
                            className="text-sm text-gray-500 hover:text-gray-700"
                          >
                            Change email address
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {data.isVerified && (
                  <div className="flex justify-center">
                    <button
                      onClick={() => setCurrentStep(2)}
                      className="relative flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-xl font-semibold hover:from-brand-600 hover:to-brand-700 shadow-lg shadow-brand-500/25 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      Continue Setup
                      <RiArrowRightLine className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Trade Selection */}
            {currentStep === 2 && (
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

            {/* Step 3: Business Details */}
            {currentStep === 3 && (
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

            {/* Step 4: Volume */}
            {currentStep === 4 && (
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

            {/* Step 5: Goals */}
            {currentStep === 5 && (
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

            {/* Step 6: Feature Selection */}
            {currentStep === 6 && (
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

            {/* Step 7: Complete */}
            {currentStep === 7 && (
              <div className="space-y-6 md:space-y-8 animate-fade-in">
                <div className="text-center space-y-3 md:space-y-4">
                  <div className="w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto shadow-xl shadow-green-500/30">
                    <RiCheckLine className="w-8 h-8 md:w-10 md:h-10 text-white" />
                  </div>
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                    Welcome to Vistrial, {data.ownerName.split(" ")[0]}!
                  </h1>
                  <p className="text-sm md:text-base text-gray-500 max-w-md mx-auto">
                    Your account is verified and ready. Let&apos;s get started!
                  </p>
                </div>

                {/* Summary Card */}
                <div className="bg-white rounded-xl md:rounded-2xl border border-gray-200 shadow-xl shadow-gray-200/50 overflow-hidden">
                  <div className="p-4 md:p-5 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-center gap-2">
                      <RiShieldCheckLine className="w-5 h-5 text-green-600" />
                      <p className="text-sm font-medium text-gray-700">Account Verified</p>
                    </div>
                  </div>
                  <div className="p-4 md:p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Email</span>
                      <span className="text-sm font-medium text-gray-900">{data.email}</span>
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
                  className="relative w-full flex items-center justify-center gap-2 px-6 py-3 md:py-4 bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-xl font-semibold text-base md:text-lg hover:from-brand-600 hover:to-brand-700 transition-all shadow-xl shadow-brand-500/25 hover:shadow-2xl hover:shadow-brand-500/30 hover:scale-[1.01] active:scale-[0.99] before:absolute before:inset-[1px] before:rounded-[10px] before:border before:border-white/20 before:border-b-transparent before:border-r-transparent before:pointer-events-none"
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

            {/* Navigation buttons (for steps 2-6) */}
            {currentStep > 1 && currentStep < 7 && (
              <div className="mt-6 md:mt-8 flex items-center justify-between">
                <button
                  onClick={handleBack}
                  disabled={currentStep === 2 && data.isVerified}
                  className={cn(
                    "flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg md:rounded-xl text-sm font-medium transition-all",
                    (currentStep === 2 && data.isVerified)
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
                      ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white hover:from-brand-600 hover:to-brand-700 shadow-lg shadow-brand-500/25 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] before:absolute before:inset-[1px] before:rounded-[7px] md:before:rounded-[10px] before:border before:border-white/20 before:border-b-transparent before:border-r-transparent before:pointer-events-none"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  )}
                >
                  {isLoading ? (
                    <>
                      <RiLoader4Line className="w-4 h-4 animate-spin" />
                      Setting up...
                    </>
                  ) : currentStep === 6 ? (
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
