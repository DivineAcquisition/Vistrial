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

  if (!user) {
    redirect("/signup");
  }

  // Check if user has completed onboarding
  // Try business_users -> businesses first
  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id, businesses(onboarding_completed)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership?.businesses) {
    const business = membership.businesses as { onboarding_completed: boolean };
    if (business.onboarding_completed) {
      redirect("/dashboard");
    }
    // Business exists but onboarding not complete - allow access
    return <>{children}</>;
  }

  // Try direct business lookup as owner
  const { data: ownedBusiness } = await supabase
    .from("businesses")
    .select("onboarding_completed")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (ownedBusiness) {
    if (ownedBusiness.onboarding_completed) {
      redirect("/dashboard");
    }
    // Business exists but onboarding not complete - allow access
    return <>{children}</>;
  }

  // Try profiles table (legacy)
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.onboarding_completed) {
    redirect("/dashboard");
  }

  // No business yet or onboarding not complete - allow access
  return <>{children}</>;
}
