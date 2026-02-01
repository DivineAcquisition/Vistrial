import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  return (
    <div className="min-h-screen bg-gray-950 relative overflow-hidden">
      {/* Animated gradient background */}
      <AnimatedBackground variant="subtle" />

      {/* Content wrapper */}
      <div className="relative z-10">
        {/* Sidebar */}
        <DashboardSidebar 
          business={business} 
          user={{ email: user.email || "" }}
        />

        {/* Main content */}
        <div className="lg:pl-64">
          {/* Header */}
          <DashboardHeader user={user} business={business} />

          {/* Page content */}
          <main className="p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
