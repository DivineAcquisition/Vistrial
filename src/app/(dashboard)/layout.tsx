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
  const { data: businesses, error: bizError } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (bizError) {
    console.error("Error fetching business:", bizError);
  }

  let business = businesses?.[0] || null;

  // If no business exists, try to create one using the regular client
  // (This requires proper RLS policies)
  if (!business) {
    console.log("No business found, attempting to create one...");
    
    const userName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "User";
    const businessName = user.user_metadata?.business_name || `${userName}'s Business`;
    const slug = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Date.now().toString(36)}`;

    const { data: newBusiness, error: createError } = await supabase
      .from("businesses")
      .insert({
        owner_id: user.id,
        name: businessName,
        slug: slug,
        trade: "cleaning",
        email: user.email,
        phone: user.user_metadata?.phone || null,
        primary_color: "#6E47D1",
        settings: {
          timezone: "America/New_York",
          currency: "USD",
          owner_name: userName,
        },
        onboarding_completed: true,
        is_active: true,
      })
      .select()
      .single();

    if (createError) {
      console.error("Failed to create business:", createError);
      
      // Show a helpful error page
      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
          <div className="text-center text-white max-w-md">
            <h1 className="text-2xl font-bold mb-4">Setup Required</h1>
            <p className="text-gray-400 mb-6">
              We couldn&apos;t set up your business account. This usually means the database isn&apos;t configured yet.
            </p>
            <div className="bg-gray-900 rounded-lg p-4 text-left text-sm mb-6">
              <p className="text-red-400 font-mono">{createError.message}</p>
              {createError.code && (
                <p className="text-gray-500 mt-2">Code: {createError.code}</p>
              )}
            </div>
            <div className="space-y-3">
              <a 
                href="/fix-onboarding" 
                className="block w-full bg-brand-600 hover:bg-brand-700 text-white py-3 px-4 rounded-lg font-medium transition-colors"
              >
                Run Diagnostics
              </a>
              <a 
                href="/login" 
                className="block w-full bg-gray-800 hover:bg-gray-700 text-white py-3 px-4 rounded-lg font-medium transition-colors"
              >
                Back to Login
              </a>
            </div>
          </div>
        </div>
      );
    }

    business = newBusiness;
    console.log("Created business:", business?.id);
  }

  // Final check - if still no business, show error
  if (!business) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center text-white max-w-md">
          <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
          <p className="text-gray-400 mb-6">
            We couldn&apos;t load your business. Please try logging in again.
          </p>
          <a 
            href="/login" 
            className="inline-block bg-brand-600 hover:bg-brand-700 text-white py-3 px-6 rounded-lg font-medium transition-colors"
          >
            Back to Login
          </a>
        </div>
      </div>
    );
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
