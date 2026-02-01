import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Force complete onboarding - creates/updates business and redirects
export async function GET() {
  console.log("=== FORCE COMPLETE ONBOARDING ===");

  try {
    // Check service role key
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({
        success: false,
        error: "SUPABASE_SERVICE_ROLE_KEY is not configured",
        fix: "Add SUPABASE_SERVICE_ROLE_KEY to your environment variables in Vercel",
      });
    }

    // Get current user
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: "Not authenticated",
        authError: authError?.message,
        fix: "Please log in first at /login",
      });
    }

    console.log("User:", user.id, user.email);

    const admin = createAdminClient();

    // Check existing businesses
    const { data: existingBusinesses, error: queryError } = await admin
      .from("businesses")
      .select("*")
      .eq("owner_id", user.id);

    if (queryError) {
      return NextResponse.json({
        success: false,
        error: "Failed to query businesses",
        details: queryError.message,
        code: queryError.code,
      });
    }

    console.log("Existing businesses:", existingBusinesses?.length || 0);

    // If business exists, just update onboarding_completed
    if (existingBusinesses && existingBusinesses.length > 0) {
      const business = existingBusinesses[0];
      console.log("Found existing business:", business.id, "onboarding_completed:", business.onboarding_completed);

      if (business.onboarding_completed) {
        return NextResponse.json({
          success: true,
          message: "Onboarding already completed!",
          business: {
            id: business.id,
            name: business.name,
            slug: business.slug,
            onboarding_completed: business.onboarding_completed,
          },
          redirectTo: "/dashboard",
        });
      }

      // Update to complete onboarding
      const { data: updated, error: updateError } = await admin
        .from("businesses")
        .update({ 
          onboarding_completed: true,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", business.id)
        .select();

      if (updateError) {
        return NextResponse.json({
          success: false,
          error: "Failed to update business",
          details: updateError.message,
          code: updateError.code,
        });
      }

      console.log("Updated business:", updated);

      return NextResponse.json({
        success: true,
        message: "Onboarding completed!",
        business: updated?.[0],
        redirectTo: "/dashboard",
      });
    }

    // No business exists - create one
    console.log("Creating new business...");

    const userName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "User";
    const businessName = user.user_metadata?.business_name || `${userName}'s Business`;
    const slug = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Date.now().toString(36)}`;

    const { data: newBusiness, error: insertError } = await admin
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select();

    if (insertError) {
      return NextResponse.json({
        success: false,
        error: "Failed to create business",
        details: insertError.message,
        code: insertError.code,
        hint: insertError.hint,
      });
    }

    console.log("Created business:", newBusiness);

    return NextResponse.json({
      success: true,
      message: "Business created and onboarding completed!",
      business: newBusiness?.[0],
      redirectTo: "/dashboard",
    });

  } catch (error) {
    console.error("Force complete error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
