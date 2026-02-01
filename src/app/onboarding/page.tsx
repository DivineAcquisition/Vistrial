"use client";

import { useState, useMemo, useEffect } from "react";
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
  RiCalendarCheckLine,
  RiTimeLine,
  RiMoneyDollarCircleLine,
  RiTeamLine,
  RiRocketLine,
  RiCheckboxCircleLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";

type Step = "welcome" | "business" | "contact" | "branding" | "complete";

const steps = [
  { id: "business", name: "Business Info", icon: RiBuilding2Line },
  { id: "contact", name: "Contact Details", icon: RiPhoneLine },
  { id: "branding", name: "Branding", icon: RiPaletteLine },
] as const;

interface Feature {
  icon: typeof RiCalendarCheckLine;
  title: string;
  desc: string;
  color: string;
}

interface QuickStartItem {
  num: number;
  text: string;
  desc: string;
  icon: typeof RiRocketLine;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>("welcome");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ownerName, setOwnerName] = useState("");

  const [formData, setFormData] = useState({
    // Business
    businessName: "",
    businessType: "cleaning",
    // Contact
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    // Branding
    primaryColor: "#6E47D1",
    tagline: "",
  });

  // Create Supabase client lazily to avoid SSR issues
  const supabase = useMemo(() => {
    if (typeof window === "undefined") return null;
    return createClient();
  }, []);

  // Get user info on mount and pre-fill form data
  useEffect(() => {
    const fetchUser = async () => {
      if (!supabase) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      
      if (!user) {
        router.push("/login");
        return;
      }
      
      // Pre-fill owner name
      if (user.user_metadata?.full_name) {
        setOwnerName(user.user_metadata.full_name);
      } else if (user.user_metadata?.name) {
        setOwnerName(user.user_metadata.name);
      }
      
      // Pre-fill business name from signup if available
      if (user.user_metadata?.business_name) {
        setFormData((prev) => ({
          ...prev,
          businessName: user.user_metadata.business_name,
        }));
      }
      
      // Pre-fill phone from signup if available
      if (user.user_metadata?.phone) {
        setFormData((prev) => ({
          ...prev,
          phone: formatPhoneInput(user.user_metadata.phone),
        }));
      }
    };
    fetchUser();
  }, [supabase, router]);

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const getCurrentStepIndex = () => {
    if (currentStep === "welcome") return -1;
    return steps.findIndex((s) => s.id === currentStep);
  };

  const goToNextStep = () => {
    if (currentStep === "welcome") {
      setCurrentStep("business");
      return;
    }
    const currentIndex = getCurrentStepIndex();
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1].id as Step);
    }
  };

  const goToPrevStep = () => {
    const currentIndex = getCurrentStepIndex();
    if (currentIndex === 0) {
      setCurrentStep("welcome");
      return;
    }
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1].id as Step);
    }
  };

  const formatPhoneInput = (value: string) => {
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

  const handleComplete = async () => {
    if (!supabase) {
      setError("Unable to connect. Please refresh the page.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error("Auth error:", userError);
        router.push("/login");
        return;
      }

      // Generate slug from business name
      const baseSlug = formData.businessName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50);

      // Make slug unique by adding random suffix
      const slug = `${baseSlug}-${Date.now().toString(36)}`;

      // Format phone to E.164
      const phoneDigits = formData.phone.replace(/\D/g, "");
      const formattedPhone =
        phoneDigits.length === 10 ? `+1${phoneDigits}` : `+${phoneDigits}`;

      // Check if user already has a business
      const { data: existingBusiness } = await supabase
        .from("businesses")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();

      const businessData = {
        name: formData.businessName,
        trade: formData.businessType,
        phone: formattedPhone,
        address_line1: formData.address,
        city: formData.city,
        state: formData.state,
        zip: formData.zip,
        primary_color: formData.primaryColor,
        settings: {
          timezone: "America/New_York",
          currency: "USD",
          date_format: "MM/DD/YYYY",
          time_format: "12h",
          tagline: formData.tagline,
        },
        onboarding_completed: true,
        is_active: true,
      };

      if (existingBusiness) {
        // Update existing business
        console.log("Updating existing business:", existingBusiness.id);
        const { error: updateError } = await supabase
          .from("businesses")
          .update(businessData)
          .eq("id", existingBusiness.id);

        if (updateError) {
          console.error("Update error details:", JSON.stringify(updateError, null, 2));
          throw new Error(`Failed to update business: ${updateError.message || updateError.code || 'Unknown error'}`);
        }
        console.log("Business updated successfully");
      } else {
        // Create new business
        console.log("Creating new business for user:", user.id);
        const insertData = {
          ...businessData,
          owner_id: user.id,
          slug,
          email: user.email,
        };
        console.log("Insert data:", JSON.stringify(insertData, null, 2));
        
        const { data: insertedBusiness, error: insertError } = await supabase
          .from("businesses")
          .insert(insertData)
          .select()
          .single();

        if (insertError) {
          console.error("Insert error details:", JSON.stringify(insertError, null, 2));
          throw new Error(`Failed to create business: ${insertError.message || insertError.code || 'Unknown error'}`);
        }
        console.log("Business created successfully:", insertedBusiness?.id);
      }

      setCurrentStep("complete");

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push("/dashboard");
      }, 2500);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      console.error("Onboarding error:", err);
      console.error("Error message:", errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const isStepValid = () => {
    switch (currentStep) {
      case "welcome":
        return true;
      case "business":
        return (
          formData.businessName.length >= 2 && formData.businessType.length > 0
        );
      case "contact":
        return formData.phone.replace(/\D/g, "").length >= 10;
      case "branding":
        return true; // Optional step
      default:
        return true;
    }
  };

  const features: Feature[] = [
    {
      icon: RiCalendarCheckLine,
      title: "Online Booking",
      desc: "Accept bookings 24/7",
      color: "bg-blue-100 text-blue-600",
    },
    {
      icon: RiTimeLine,
      title: "Save 10+ Hours",
      desc: "Per week on scheduling",
      color: "bg-emerald-100 text-emerald-600",
    },
    {
      icon: RiMoneyDollarCircleLine,
      title: "Grow Revenue",
      desc: "Increase bookings 30%",
      color: "bg-amber-100 text-amber-600",
    },
  ];

  const quickStartItems: QuickStartItem[] = [
    {
      num: 1,
      text: "Set up your booking page",
      desc: "Share your personalized link",
      icon: RiRocketLine,
    },
    {
      num: 2,
      text: "Add your first customer",
      desc: "Start building your database",
      icon: RiTeamLine,
    },
    {
      num: 3,
      text: "Create a booking",
      desc: "See your schedule in action",
      icon: RiCalendarCheckLine,
    },
  ];

  // Complete step
  if (currentStep === "complete") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
        {/* Header */}
        <header className="p-6 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <Link href="/" className="inline-block">
              <Image
                src="/VISTRIAL.png"
                alt="Vistrial"
                width={140}
                height={48}
                className="object-contain"
                priority
              />
            </Link>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="text-center space-y-8 max-w-md animate-fade-in">
            <div className="space-y-4">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center mx-auto shadow-lg">
                <RiCheckboxCircleLine className="w-12 h-12 text-emerald-600" />
              </div>

              <h1 className="text-3xl md:text-4xl font-bold text-slate-900">
                You&apos;re all set
                {ownerName ? `, ${ownerName.split(" ")[0]}` : ""}!
              </h1>

              <p className="text-lg text-slate-500">
                Your account is ready. Let&apos;s start growing your business.
              </p>
            </div>

            {/* Next Steps */}
            <div className="bg-white rounded-2xl shadow-xl p-6 text-left">
              <h3 className="font-semibold text-slate-900 mb-5 flex items-center gap-2">
                <RiSparklingLine className="w-5 h-5 text-brand-600" />
                Quick Start Guide
              </h3>

              <div className="space-y-4">
                {quickStartItems.map((item) => (
                  <div
                    key={item.num}
                    className="flex items-start gap-4 p-3 bg-slate-50 rounded-xl"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-lg shadow-brand-500/20">
                      {item.num}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{item.text}</p>
                      <p className="text-sm text-slate-500">{item.desc}</p>
                    </div>
                    <item.icon className="w-5 h-5 text-slate-300" />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 text-brand-600">
              <RiLoader4Line className="w-5 h-5 animate-spin" />
              <span>Loading your dashboard...</span>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="p-6 text-center text-sm text-slate-500 border-t border-slate-200/60">
          © {new Date().getFullYear()} Vistrial. All rights reserved.
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
      {/* Header */}
      <header className="p-6 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="inline-block">
            <Image
              src="/VISTRIAL.png"
              alt="Vistrial"
              width={140}
              height={48}
              className="object-contain"
              priority
            />
          </Link>
          {currentStep !== "welcome" && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-400">Step</span>
              <span className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-brand-700 bg-brand-100 rounded-full">
                {getCurrentStepIndex() + 1} of {steps.length}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          {/* Welcome Step */}
          {currentStep === "welcome" && (
            <div className="text-center space-y-8 animate-fade-in">
              <div className="space-y-4">
                <span className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-brand-700 bg-brand-100 rounded-full">
                  <RiSparklingLine className="w-4 h-4" />
                  Welcome to Vistrial
                </span>

                <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900">
                  Let&apos;s set up your
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-500 to-brand-600 block mt-2">
                    cleaning business
                  </span>
                </h1>

                <p className="text-lg text-slate-500 max-w-md mx-auto">
                  Takes less than 2 minutes. We&apos;ll help you get everything
                  ready.
                </p>
              </div>

              {/* Features */}
              <div className="grid sm:grid-cols-3 gap-4 py-6">
                {features.map((feature, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-2xl shadow-lg p-5 text-center hover:shadow-xl transition-all group"
                  >
                    <div
                      className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 transition-transform group-hover:scale-110",
                        feature.color
                      )}
                    >
                      <feature.icon className="w-6 h-6" />
                    </div>
                    <h3 className="font-semibold text-slate-900 mb-1">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-slate-500">{feature.desc}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={goToNextStep}
                className="group relative h-14 px-10 text-lg font-semibold gap-2 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white rounded-xl shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30 inline-flex items-center justify-center transition-all hover:scale-[1.02] active:scale-[0.98] before:absolute before:inset-[1px] before:rounded-[10px] before:border before:border-white/20 before:border-b-transparent before:border-r-transparent before:pointer-events-none"
              >
                Get Started
                <RiArrowRightLine className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>

              <p className="text-sm text-slate-400">No credit card required</p>
            </div>
          )}

          {/* Progress steps for non-welcome steps */}
          {currentStep !== "welcome" && (
            <>
              <div className="mb-8">
                <div className="flex items-center justify-between relative">
                  {/* Progress line */}
                  <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-slate-200 -translate-y-1/2" />
                  <div
                    className="absolute left-0 top-1/2 h-0.5 bg-brand-500 -translate-y-1/2 transition-all duration-300"
                    style={{
                      width: `${(getCurrentStepIndex() / (steps.length - 1)) * 100}%`,
                    }}
                  />

                  {steps.map((step, index) => {
                    const isCompleted = index < getCurrentStepIndex();
                    const isCurrent = step.id === currentStep;

                    return (
                      <div
                        key={step.id}
                        className="relative z-10 flex flex-col items-center"
                      >
                        <div
                          className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300",
                            isCompleted
                              ? "bg-brand-500 text-white"
                              : isCurrent
                                ? "bg-brand-500 text-white ring-4 ring-brand-100"
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
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                    {error}
                  </div>
                )}

                {/* Business Info Step */}
                {currentStep === "business" && (
                  <div>
                    <div className="text-center mb-8">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-brand-500/20">
                        <RiBuilding2Line className="w-8 h-8 text-white" />
                      </div>
                      <h2 className="text-2xl font-bold text-slate-900 mb-2">
                        Tell us about your business
                      </h2>
                      <p className="text-slate-500">
                        This helps us customize your experience.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          Business name
                        </label>
                        <div className="relative">
                          <RiBuilding2Line className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                          <input
                            type="text"
                            value={formData.businessName}
                            onChange={(e) =>
                              updateField("businessName", e.target.value)
                            }
                            placeholder="Sparkle Clean Co"
                            className="w-full h-12 pl-11 pr-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 transition-all"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          Business type
                        </label>
                        <select
                          value={formData.businessType}
                          onChange={(e) =>
                            updateField("businessType", e.target.value)
                          }
                          className="w-full h-12 px-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 bg-white transition-all"
                        >
                          <option value="cleaning">Cleaning Services</option>
                          <option value="plumbing">Plumbing</option>
                          <option value="electrical">Electrical</option>
                          <option value="hvac">HVAC</option>
                          <option value="landscaping">Landscaping</option>
                          <option value="painting">Painting</option>
                          <option value="roofing">Roofing</option>
                          <option value="pest_control">Pest Control</option>
                          <option value="handyman">Handyman</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Contact Details Step */}
                {currentStep === "contact" && (
                  <div>
                    <div className="text-center mb-8">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-brand-500/20">
                        <RiPhoneLine className="w-8 h-8 text-white" />
                      </div>
                      <h2 className="text-2xl font-bold text-slate-900 mb-2">
                        Contact information
                      </h2>
                      <p className="text-slate-500">
                        How can your customers reach you?
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          Phone number
                        </label>
                        <div className="relative">
                          <RiPhoneLine className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                          <input
                            type="tel"
                            value={formData.phone}
                            onChange={(e) =>
                              updateField(
                                "phone",
                                formatPhoneInput(e.target.value)
                              )
                            }
                            placeholder="(555) 123-4567"
                            className="w-full h-12 pl-11 pr-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 transition-all"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          Business address{" "}
                          <span className="text-slate-400">(optional)</span>
                        </label>
                        <div className="relative">
                          <RiMapPinLine className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-400" />
                          <input
                            type="text"
                            value={formData.address}
                            onChange={(e) =>
                              updateField("address", e.target.value)
                            }
                            placeholder="123 Main Street"
                            className="w-full h-12 pl-11 pr-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 transition-all"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-1">
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            City
                          </label>
                          <input
                            type="text"
                            value={formData.city}
                            onChange={(e) => updateField("city", e.target.value)}
                            placeholder="City"
                            className="w-full h-12 px-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            State
                          </label>
                          <input
                            type="text"
                            value={formData.state}
                            onChange={(e) =>
                              updateField("state", e.target.value.toUpperCase())
                            }
                            placeholder="CA"
                            maxLength={2}
                            className="w-full h-12 px-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            ZIP
                          </label>
                          <input
                            type="text"
                            value={formData.zip}
                            onChange={(e) => updateField("zip", e.target.value)}
                            placeholder="90210"
                            maxLength={10}
                            className="w-full h-12 px-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 transition-all"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Branding Step */}
                {currentStep === "branding" && (
                  <div>
                    <div className="text-center mb-8">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-brand-500/20">
                        <RiPaletteLine className="w-8 h-8 text-white" />
                      </div>
                      <h2 className="text-2xl font-bold text-slate-900 mb-2">
                        Customize your brand
                      </h2>
                      <p className="text-slate-500">
                        Make your booking page feel like yours.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          Brand color
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={formData.primaryColor}
                            onChange={(e) =>
                              updateField("primaryColor", e.target.value)
                            }
                            className="w-12 h-12 rounded-xl cursor-pointer border border-slate-200"
                          />
                          <input
                            type="text"
                            value={formData.primaryColor}
                            onChange={(e) =>
                              updateField("primaryColor", e.target.value)
                            }
                            className="flex-1 h-12 px-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 font-mono transition-all"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          Tagline{" "}
                          <span className="text-slate-400">(optional)</span>
                        </label>
                        <input
                          type="text"
                          value={formData.tagline}
                          onChange={(e) =>
                            updateField("tagline", e.target.value)
                          }
                          placeholder="Quality service you can trust"
                          className="w-full h-12 px-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 transition-all"
                        />
                      </div>

                      {/* Preview */}
                      <div className="mt-6 p-4 rounded-xl border border-slate-200 bg-slate-50">
                        <p className="text-xs text-slate-500 mb-3">Preview</p>
                        <div className="flex items-center gap-3">
                          <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg"
                            style={{ backgroundColor: formData.primaryColor }}
                          >
                            {formData.businessName?.[0]?.toUpperCase() || "B"}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">
                              {formData.businessName || "Your Business"}
                            </p>
                            {formData.tagline && (
                              <p className="text-sm text-slate-500">
                                {formData.tagline}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Navigation buttons */}
                <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
                  <button
                    onClick={goToPrevStep}
                    className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium transition-colors"
                  >
                    <RiArrowLeftLine className="w-4 h-4" />
                    Back
                  </button>

                  {getCurrentStepIndex() < steps.length - 1 ? (
                    <button
                      onClick={goToNextStep}
                      disabled={!isStepValid()}
                      className="group relative flex items-center gap-2 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white px-6 py-3 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30 hover:scale-[1.02] active:scale-[0.98] before:absolute before:inset-[1px] before:rounded-[10px] before:border before:border-white/20 before:border-b-transparent before:border-r-transparent before:pointer-events-none"
                    >
                      Continue
                      <RiArrowRightLine className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                  ) : (
                    <button
                      onClick={handleComplete}
                      disabled={loading}
                      className="group relative flex items-center gap-2 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white px-6 py-3 rounded-xl font-semibold disabled:opacity-50 transition-all shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30 hover:scale-[1.02] active:scale-[0.98] before:absolute before:inset-[1px] before:rounded-[10px] before:border before:border-white/20 before:border-b-transparent before:border-r-transparent before:pointer-events-none"
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
            </>
          )}

          {/* Skip link - only show on non-welcome steps */}
          {currentStep !== "welcome" && (
            <div className="text-center mt-6">
              <Link
                href="/dashboard"
                className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                Skip for now
              </Link>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 text-center text-sm text-slate-500 border-t border-slate-200/60">
        © {new Date().getFullYear()} Vistrial. All rights reserved.
      </footer>
    </div>
  );
}
