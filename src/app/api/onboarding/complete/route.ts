import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
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
    if (!userId || !businessName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify the user is authenticated
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || user.id !== userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
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

    // Format phone to E.164
    const phoneDigits = phone?.replace(/\D/g, "") || "";
    const formattedPhone = phoneDigits.length === 10 
      ? `+1${phoneDigits}` 
      : phoneDigits.length > 0 
        ? `+${phoneDigits}` 
        : null;

    // Check if user already has a business
    const { data: existingBusiness } = await admin
      .from("businesses")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();

    const businessData = {
      name: businessName,
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
    };

    let result;

    if (existingBusiness) {
      // Update existing business
      console.log("Updating existing business:", existingBusiness.id);
      const { data, error } = await admin
        .from("businesses")
        .update(businessData)
        .eq("id", existingBusiness.id)
        .select()
        .single();

      if (error) {
        console.error("Business update error:", error);
        return NextResponse.json(
          { error: `Failed to update business: ${error.message}` },
          { status: 500 }
        );
      }
      result = data;
    } else {
      // Create new business
      console.log("Creating new business for user:", userId);
      const { data, error } = await admin
        .from("businesses")
        .insert({
          ...businessData,
          owner_id: userId,
          slug,
        })
        .select()
        .single();

      if (error) {
        console.error("Business insert error:", error);
        return NextResponse.json(
          { error: `Failed to create business: ${error.message}` },
          { status: 500 }
        );
      }
      result = data;
    }

    console.log("Business saved successfully:", result?.id);

    // Also ensure user profile exists
    const nameParts = (ownerName || "").trim().split(/\s+/);
    await admin.from("user_profiles").upsert({
      id: userId,
      first_name: nameParts[0] || "",
      last_name: nameParts.slice(1).join(" ") || "",
      phone: formattedPhone,
    }, { onConflict: "id" });

    return NextResponse.json({ 
      success: true, 
      business: result 
    });
  } catch (error) {
    console.error("Onboarding API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
