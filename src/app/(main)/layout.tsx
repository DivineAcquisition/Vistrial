import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { VistrialLayoutWrapper } from "@/components/ui/navigation/VistrialLayoutWrapper";

export default async function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createServerSupabaseClient();

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get user's business
  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  // If no business exists, redirect to onboarding
  if (!business) {
    redirect("/onboarding");
  }

  // If onboarding not completed, redirect to onboarding
  if (!business.onboarding_completed) {
    redirect("/onboarding");
  }

  return <VistrialLayoutWrapper>{children}</VistrialLayoutWrapper>;
}
