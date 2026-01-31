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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Try businesses table first
  let business = null;
  
  try {
    const { data: businessData } = await supabase
      .from("businesses")
      .select("*")
      .eq("owner_id", user.id)
      .single();

    if (businessData) {
      business = businessData;
    }
  } catch {
    // Business table might not exist, continue to profile check
  }

  if (!business) {
    // Fall back to profiles table for legacy support
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profile) {
        // Check if onboarding is completed or if they have a business name
        if (profile.onboarding_completed || profile.business_name) {
          business = {
            id: profile.id,
            name: profile.business_name || "My Business",
            slug: profile.business_slug || "my-business",
            logo_url: profile.logo_url,
          };
        }
      }
    } catch {
      // Profile table might not exist or other error
    }
  }

  // Last resort - create a default business object if user exists
  // This prevents looping when tables don't exist or have issues
  if (!business) {
    // For new users (created in last 30 seconds), redirect to onboarding
    // This gives a small window for legitimate new signups
    const userCreatedAt = new Date(user.created_at || Date.now());
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
    
    if (userCreatedAt > thirtySecondsAgo) {
      redirect("/onboarding");
    }
    
    // For older users without business records, create a fallback
    // This handles edge cases where DB writes failed but user completed onboarding
    business = {
      id: user.id,
      name: user.email?.split("@")[0] || "My Business",
      slug: "my-business",
      logo_url: null,
    };
  }

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
