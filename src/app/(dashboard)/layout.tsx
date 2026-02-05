// @ts-nocheck
// TODO: Migrate to new organization-based schema
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
  let { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  // If no business exists, create one automatically (NO redirect to onboarding)
  if (!business) {
    const admin = createAdminClient();
    const fullName =
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      "User";

    const baseSlug = fullName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);

    // Ensure unique slug
    let slug = baseSlug;
    let counter = 1;
    while (true) {
      const { data: existing } = await admin
        .from("businesses")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!existing) break;
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Create business
    const { data: newBusiness } = await admin
      .from("businesses")
      .insert({
        owner_id: user.id,
        name: `${fullName}'s Business`,
        slug,
        email: user.email,
        phone: user.user_metadata?.phone,
        is_active: true,
      })
      .select()
      .single();

    business = newBusiness;
  }

  // Fallback business object if still null (shouldn't happen)
  const businessData = business || {
    id: user.id,
    name: "My Business",
    slug: "my-business",
    email: user.email,
  };

  return (
    <div className="min-h-screen bg-gray-950 relative overflow-hidden">
      {/* Animated gradient background */}
      <AnimatedBackground variant="subtle" />

      {/* Content wrapper */}
      <div className="relative z-10">
        {/* Sidebar */}
        <DashboardSidebar 
          business={businessData} 
          user={{ email: user.email || "" }}
        />

        {/* Main content */}
        <div className="lg:pl-64">
          {/* Header */}
          <DashboardHeader user={user} business={businessData} />

          {/* Page content */}
          <main className="p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
