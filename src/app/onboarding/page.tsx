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

interface Business {
  id: string;
  name: string;
  slug: string;
  onboarding_step: number;
  trade?: string;
}

interface UserData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  businessName: string;
  phone?: string;
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
  const [userData, setUserData] = useState<UserData | null>(null);
  
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
        
        // Store user data for potential business creation
        const metadata = user.user_metadata || {};
        setUserData({
          id: user.id,
          email: user.email || "",
          firstName: metadata.first_name || "",
          lastName: metadata.last_name || "",
          businessName: metadata.business_name || "",
          phone: metadata.phone || "",
        });
        
        // Try to get business from business_users table
        const { data: membership } = await supabase
          .from("business_users")
          .select("business_id, businesses(*)")
          .eq("user_id", user.id)
          .maybeSingle();
        
        if (membership?.businesses) {
          const biz = membership.businesses as unknown as Business;
          setBusiness(biz);
          setData(prev => ({
            ...prev,
            trade: biz.trade || "",
          }));
          setCurrentStep(biz.onboarding_step || 1);
          
          // If onboarding is already complete, redirect to dashboard
          if ((membership.businesses as any).onboarding_completed) {
            router.push("/dashboard");
            return;
          }
        } else {
          // Try direct business lookup as owner
          const { data: ownedBusiness } = await supabase
            .from("businesses")
            .select("*")
            .eq("owner_id", user.id)
            .maybeSingle();
          
          if (ownedBusiness) {
            setBusiness({
              id: ownedBusiness.id,
              name: ownedBusiness.name,
              slug: ownedBusiness.slug,
              onboarding_step: ownedBusiness.onboarding_step || 1,
              trade: ownedBusiness.trade,
            });
            setData(prev => ({
              ...prev,
              trade: ownedBusiness.trade || "",
            }));
            setCurrentStep(ownedBusiness.onboarding_step || 1);
            
            if (ownedBusiness.onboarding_completed) {
              router.push("/dashboard");
              return;
            }
          } else {
            // Try profiles table (legacy)
            const { data: profile } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", user.id)
              .maybeSingle();
            
            if (profile?.onboarding_completed) {
              router.push("/dashboard");
              return;
            }
            
            // No business exists - we'll create one when they complete step 1
            console.log("No business found - will create during onboarding");
          }
        }
      } catch (err) {
        console.error("Auth check error:", err);
        setError("Failed to load user data. Please try again.");
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

  const createBusinessIfNeeded = async () => {
    if (business || !userData) return business;

    // Generate slug
    let slug = (userData.businessName || "my-business")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);

    // Check for uniqueness
    const { data: existing } = await supabase
      .from("businesses")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    // Create business
    const { data: newBusiness, error: createError } = await supabase
      .from("businesses")
      .insert({
        owner_id: userData.id,
        name: userData.businessName || "My Business",
        slug,
        email: userData.email,
        phone: userData.phone || null,
        trade: data.trade,
        onboarding_completed: false,
        onboarding_step: 1,
      })
      .select()
      .single();

    if (createError) {
      console.error("Business creation error:", createError);
      // Try profiles table as fallback
      await supabase.from("profiles").upsert({
        id: userData.id,
        email: userData.email,
        full_name: `${userData.firstName} ${userData.lastName}`,
        business_name: userData.businessName || "My Business",
        business_slug: slug,
        phone: userData.phone || null,
        trade: data.trade,
        onboarding_completed: false,
      });
      return null;
    }

    // Add user as business owner
    await supabase.from("business_users").insert({
      business_id: newBusiness.id,
      user_id: userData.id,
      role: "owner",
      display_name: `${userData.firstName} ${userData.lastName}`,
      joined_at: new Date().toISOString(),
    });

    setBusiness(newBusiness);
    return newBusiness;
  };

  const handleNext = async () => {
    setError("");
    setIsLoading(true);

    try {
      // Create business if it doesn't exist (on step 1 completion)
      let currentBusiness = business;
      if (currentStep === 1) {
        currentBusiness = await createBusinessIfNeeded();
      }

      if (currentBusiness) {
        // Save trade selection and step progress
        const updateData: Record<string, any> = {
          onboarding_step: currentStep + 1,
        };
        
        if (currentStep === 1 && data.trade) {
          updateData.trade = data.trade;
        }
        
        if (currentStep === totalSteps) {
          updateData.onboarding_completed = true;
        }

        await supabase
          .from("businesses")
          .update(updateData)
          .eq("id", currentBusiness.id);
      } else if (userData && currentStep === totalSteps) {
        // Fallback: save to profiles table
        await supabase.from("profiles").upsert({
          id: userData.id,
          trade: data.trade,
          onboarding_completed: true,
        });
      }

      if (currentStep === totalSteps) {
        router.push("/dashboard");
      } else {
        setCurrentStep(currentStep + 1);
      }
    } catch (err) {
      console.error("Save error:", err);
      setError("Failed to save progress. Please try again.");
    }
    
    setIsLoading(false);
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = async () => {
    setIsLoading(true);
    try {
      let currentBusiness = business;
      if (!currentBusiness) {
        currentBusiness = await createBusinessIfNeeded();
      }

      if (currentBusiness) {
        await supabase
          .from("businesses")
          .update({ onboarding_completed: true })
          .eq("id", currentBusiness.id);
      } else if (userData) {
        await supabase.from("profiles").upsert({
          id: userData.id,
          onboarding_completed: true,
        });
      }
      router.push("/dashboard");
    } catch (err) {
      console.error("Skip error:", err);
      setError("Failed to skip. Please try again.");
      setIsLoading(false);
    }
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
          <div className="flex items-center gap-3">
            <Logo size="sm" variant="dark" showText={true} />
            {(business?.name || userData?.businessName) && (
              <span className="text-slate-400">|</span>
            )}
            {(business?.name || userData?.businessName) && (
              <span className="font-medium text-slate-700">
                {business?.name || userData?.businessName}
              </span>
            )}
          </div>
          <button
            onClick={handleSkip}
            disabled={isLoading}
            className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50"
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

              {(business?.slug || userData?.businessName) && (
                <div className="bg-slate-50 rounded-lg p-4 inline-block">
                  <p className="text-sm text-slate-500 mb-1">Your booking page</p>
                  <a
                    href={`https://book.vistrial.io/${business?.slug || userData?.businessName?.toLowerCase().replace(/\s+/g, "-")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-600 font-medium hover:underline"
                  >
                    book.vistrial.io/{business?.slug || userData?.businessName?.toLowerCase().replace(/\s+/g, "-")}
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
            disabled={currentStep === 1 || isLoading}
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
