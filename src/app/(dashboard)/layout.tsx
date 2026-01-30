import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/header";

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
  const { data: businessData } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", user.id)
    .single();

  if (businessData) {
    business = businessData;
  } else {
    // Fall back to profiles table for legacy support
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profile) {
      business = {
        id: profile.id,
        name: profile.business_name || "My Business",
        slug: profile.business_slug || "my-business",
        logo_url: profile.logo_url,
      };
    }
  }

  if (!business) {
    redirect("/onboarding");
  }

  return (
    <div className="min-h-screen bg-slate-50">
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
  );
}
