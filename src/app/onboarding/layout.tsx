import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();

  // Check if user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If not authenticated, redirect to signup
  if (!user) {
    redirect("/signup");
  }

  // Check if user already has a business set up
  let hasCompletedOnboarding = false;

  try {
    // Check businesses table
    const { data: business } = await supabase
      .from("businesses")
      .select("id")
      .eq("owner_id", user.id)
      .single();

    if (business) {
      hasCompletedOnboarding = true;
    }
  } catch {
    // Table might not exist
  }

  if (!hasCompletedOnboarding) {
    try {
      // Check profiles table
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, onboarding_completed, business_name")
        .eq("id", user.id)
        .single();

      if (profile?.onboarding_completed || profile?.business_name) {
        hasCompletedOnboarding = true;
      }
    } catch {
      // Table might not exist
    }
  }

  // If already completed onboarding, redirect to dashboard
  if (hasCompletedOnboarding) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
