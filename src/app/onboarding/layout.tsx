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

  // Check if user already completed onboarding
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", user.id)
      .single();

    // If onboarding already completed, redirect to dashboard
    if (profile?.onboarding_completed) {
      redirect("/dashboard");
    }
  } catch {
    // Profile might not exist yet - that's fine, let them continue onboarding
  }

  return <>{children}</>;
}
