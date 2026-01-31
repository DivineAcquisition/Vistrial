import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";

interface Business {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  trade?: string;
  phone?: string;
  email?: string;
  onboarding_completed?: boolean;
}

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

  // Get user's business membership
  let business: Business | null = null;

  // 1. Try business_users first (new system)
  const { data: membership } = await supabase
    .from("business_users")
    .select("role, businesses(*)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership?.businesses) {
    const biz = membership.businesses as any;
    business = {
      id: biz.id,
      name: biz.name || "My Business",
      slug: biz.slug || "my-business",
      logo_url: biz.logo_url,
      trade: biz.trade,
      phone: biz.phone,
      email: biz.email,
      onboarding_completed: biz.onboarding_completed,
    };

    // Redirect to onboarding if not completed
    if (!biz.onboarding_completed) {
      redirect("/onboarding");
    }
  }

  // 2. Fallback: check businesses table directly (owner)
  if (!business) {
    const { data: ownedBusiness } = await supabase
      .from("businesses")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (ownedBusiness) {
      business = {
        id: ownedBusiness.id,
        name: ownedBusiness.name || "My Business",
        slug: ownedBusiness.slug || "my-business",
        logo_url: ownedBusiness.logo_url,
        trade: ownedBusiness.trade,
        phone: ownedBusiness.phone,
        email: ownedBusiness.email,
        onboarding_completed: ownedBusiness.onboarding_completed,
      };

      if (!ownedBusiness.onboarding_completed) {
        redirect("/onboarding");
      }
    }
  }

  // 3. Fallback: check profiles table (legacy)
  if (!business) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profile) {
      if (!profile.onboarding_completed) {
        redirect("/onboarding");
      }
      
      business = {
        id: profile.id,
        name: profile.business_name || "My Business",
        slug: profile.business_slug || "my-business",
        logo_url: profile.logo_url,
        trade: profile.trade,
        phone: profile.phone,
        email: profile.email,
        onboarding_completed: true,
      };
    }
  }

  // 4. No business found at all - redirect to onboarding
  if (!business) {
    redirect("/onboarding");
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
