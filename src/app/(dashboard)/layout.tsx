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

  // Get user's profile
  let profile = null;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    
    profile = data;
  } catch {
    // Profile might not exist
  }

  // Check if onboarding is completed
  if (!profile?.onboarding_completed) {
    redirect("/onboarding");
  }

  // Build business object from profile
  const business = {
    id: profile.id,
    name: profile.business_name || "My Business",
    slug: profile.business_slug || "my-business",
    logo_url: profile.logo_url || null,
    trade: profile.trade,
    phone: profile.phone,
  };

  return (
    <div className="min-h-screen bg-gray-950 relative overflow-hidden">
      {/* Animated gradient background */}
      <AnimatedBackground variant="subtle" />

      {/* Content wrapper */}
      <div className="relative z-10">
        {/* Sidebar */}
        <DashboardSidebar business={business} />

        {/* Main content */}
        <div className="lg:pl-64">
          {/* Header */}
          <DashboardHeader user={user} business={business} />

          {/* Page content */}
          <main className="p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
