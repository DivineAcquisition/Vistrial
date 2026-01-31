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

  // Check if user has a business
  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id, businesses(onboarding_completed)")
    .eq("user_id", user.id)
    .single();

  // If no business, allow access to onboarding to set one up
  if (!membership?.businesses) {
    return <>{children}</>;
  }

  // If onboarding already completed, redirect to dashboard
  const business = membership.businesses as { onboarding_completed: boolean };
  if (business.onboarding_completed) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
