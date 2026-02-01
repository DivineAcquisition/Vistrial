import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DashboardSidebar } from "@/components/dashboard/sidebar";

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

  // If no business exists, try to create one
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
      
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Setup Required</h1>
            <p className="text-gray-600 mb-6">
              We couldn&apos;t set up your business account. This usually means the database isn&apos;t configured yet.
            </p>
            <div className="bg-white rounded-xl p-4 text-left text-sm mb-6 border border-gray-200">
              <p className="text-red-600 font-mono">{createError.message}</p>
              {createError.code && (
                <p className="text-gray-500 mt-2">Code: {createError.code}</p>
              )}
            </div>
            <div className="space-y-3">
              <a 
                href="/fix-onboarding" 
                className="block w-full bg-brand-600 hover:bg-brand-700 text-white py-3 px-4 rounded-xl font-medium transition-colors"
              >
                Run Diagnostics
              </a>
              <a 
                href="/login" 
                className="block w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-4 rounded-xl font-medium transition-colors"
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

  if (!business) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Something went wrong</h1>
          <p className="text-gray-600 mb-6">
            We couldn&apos;t load your business. Please try logging in again.
          </p>
          <a 
            href="/login" 
            className="inline-block bg-brand-600 hover:bg-brand-700 text-white py-3 px-6 rounded-xl font-medium transition-colors"
          >
            Back to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="hidden lg:block flex-shrink-0">
        <DashboardSidebar 
          business={business} 
          user={{ email: user.email || "" }}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header would go here */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
