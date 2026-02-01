import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  console.log("=== ONBOARDING API CALLED ===");
  
  try {
    // Check if admin client is configured
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.error("CRITICAL: SUPABASE_SERVICE_ROLE_KEY is not set!");
      return NextResponse.json(
        { error: "Server configuration error: Missing service role key. Please contact support." },
        { status: 500 }
      );
    }

    const body = await request.json();
    console.log("Request body:", JSON.stringify(body, null, 2));
    
    const {
      userId,
      userEmail,
      ownerName,
      businessName,
      businessType,
      phone,
      email,
      address,
      city,
      state,
      zip,
    } = body;

    // Validate required fields
    if (!userId) {
      console.error("Missing userId");
      return NextResponse.json(
        { error: "Missing user ID. Please log in again." },
        { status: 400 }
      );
    }
    
    if (!businessName || businessName.trim().length < 2) {
      console.error("Missing or invalid businessName");
      return NextResponse.json(
        { error: "Business name is required (minimum 2 characters)" },
        { status: 400 }
      );
    }

    // Verify the user is authenticated
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    console.log("Auth check - user:", user?.id, "expected:", userId);
    
    if (authError) {
      console.error("Auth error:", authError);
      return NextResponse.json(
        { error: "Authentication error. Please log in again." },
        { status: 401 }
      );
    }

    if (!user || user.id !== userId) {
      console.error("User mismatch or not authenticated");
      return NextResponse.json(
        { error: "Session expired. Please log in again." },
        { status: 401 }
      );
    }

    // Use admin client to bypass RLS
    const admin = createAdminClient();

    // Generate a unique slug
    const baseSlug = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
    const slug = `${baseSlug}-${Date.now().toString(36)}`;
    console.log("Generated slug:", slug);

    // Format phone to E.164
    const phoneDigits = phone?.replace(/\D/g, "") || "";
    const formattedPhone = phoneDigits.length === 10 
      ? `+1${phoneDigits}` 
      : phoneDigits.length > 0 
        ? `+${phoneDigits}` 
        : null;

    // Check if user already has a business (handle duplicates gracefully)
    console.log("Checking for existing business...");
    const { data: existingBusinesses, error: checkError } = await admin
      .from("businesses")
      .select("id, onboarding_completed, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (checkError) {
      console.error("Error checking existing business:", checkError);
      return NextResponse.json(
        { error: `Database error: ${checkError.message}` },
        { status: 500 }
      );
    }

    // Get the first (most recent) business if any exist
    const existingBusiness = existingBusinesses && existingBusinesses.length > 0 
      ? existingBusinesses[0] 
      : null;
    
    console.log("Found businesses:", existingBusinesses?.length || 0);
    console.log("Using business:", existingBusiness);
    
    // If there are duplicate businesses, clean them up (keep only the most recent)
    if (existingBusinesses && existingBusinesses.length > 1) {
      console.log("Found duplicate businesses, cleaning up...");
      const idsToDelete = existingBusinesses.slice(1).map(b => b.id);
      const { error: deleteError } = await admin
        .from("businesses")
        .delete()
        .in("id", idsToDelete);
      
      if (deleteError) {
        console.warn("Failed to clean up duplicate businesses:", deleteError);
      } else {
        console.log("Cleaned up", idsToDelete.length, "duplicate businesses");
      }
    }

    const businessData = {
      name: businessName.trim(),
      trade: businessType || "cleaning",
      phone: formattedPhone,
      email: email || userEmail,
      address_line1: address || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      primary_color: "#6E47D1",
      settings: {
        timezone: "America/New_York",
        currency: "USD",
        date_format: "MM/DD/YYYY",
        time_format: "12h",
        owner_name: ownerName,
      },
      onboarding_completed: true,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    let result;

    if (existingBusiness) {
      // Update existing business
      console.log("Updating existing business:", existingBusiness.id);
      const { data, error } = await admin
        .from("businesses")
        .update(businessData)
        .eq("id", existingBusiness.id)
        .select();

      if (error) {
        console.error("Business update error:", error);
        return NextResponse.json(
          { error: `Failed to update business: ${error.message}` },
          { status: 500 }
        );
      }
      result = data?.[0] || null;
      console.log("Business updated successfully:", result?.id);
    } else {
      // Create new business
      console.log("Creating new business for user:", userId);
      const { data, error } = await admin
        .from("businesses")
        .insert({
          ...businessData,
          owner_id: userId,
          slug,
          created_at: new Date().toISOString(),
        })
        .select();

      if (error) {
        console.error("Business insert error:", error);
        // Check for specific errors
        if (error.code === "23505") {
          return NextResponse.json(
            { error: "A business with this information already exists." },
            { status: 400 }
          );
        }
        if (error.code === "42501") {
          return NextResponse.json(
            { error: "Permission denied. Service role key may be invalid." },
            { status: 500 }
          );
        }
        return NextResponse.json(
          { error: `Failed to create business: ${error.message}` },
          { status: 500 }
        );
      }
      result = data?.[0] || null;
      console.log("Business created successfully:", result?.id);
    }

    // Verify the business was actually saved
    if (!result || !result.id) {
      console.error("Business save returned no result!");
      return NextResponse.json(
        { error: "Failed to save business. Please try again." },
        { status: 500 }
      );
    }

    // Also ensure user profile exists
    console.log("Upserting user profile...");
    const nameParts = (ownerName || "").trim().split(/\s+/);
    const { error: profileError } = await admin.from("user_profiles").upsert({
      id: userId,
      first_name: nameParts[0] || "",
      last_name: nameParts.slice(1).join(" ") || "",
      phone: formattedPhone,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

    if (profileError) {
      console.warn("User profile upsert warning:", profileError);
      // Don't fail the whole operation for profile errors
    }

    console.log("=== ONBOARDING COMPLETE ===");
    console.log("Business ID:", result.id);
    console.log("Onboarding completed:", result.onboarding_completed);

    return NextResponse.json({ 
      success: true, 
      business: {
        id: result.id,
        name: result.name,
        slug: result.slug,
        onboarding_completed: result.onboarding_completed,
      },
      redirectTo: "/dashboard",
    });
  } catch (error) {
    console.error("=== ONBOARDING API ERROR ===");
    console.error("Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error. Please try again." },
      { status: 500 }
    );
  }
}
