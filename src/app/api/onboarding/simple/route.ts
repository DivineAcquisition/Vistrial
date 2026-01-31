import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface SimpleOnboardingPayload {
  trade: string;
  businessName: string;
  ownerName: string;
  phone?: string;
  monthlyQuotes?: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload: SimpleOnboardingPayload = await request.json();

    // Validate required fields
    if (!payload.trade || !payload.businessName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Generate a slug from business name
    const slug = payload.businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 50);

    // Try to create/update business in businesses table first
    const { data: existingBusiness } = await supabase
      .from("businesses")
      .select("id")
      .eq("owner_id", user.id)
      .single();

    if (existingBusiness) {
      // Update existing business
      const { error: updateError } = await supabase
        .from("businesses")
        .update({
          name: payload.businessName,
          slug: slug,
          trade: payload.trade,
          owner_name: payload.ownerName,
          phone: payload.phone || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingBusiness.id);

      if (updateError) {
        console.error("Error updating business:", updateError);
      }
    } else {
      // Try to create new business
      const { error: insertError } = await supabase.from("businesses").insert({
        owner_id: user.id,
        name: payload.businessName,
        slug: slug,
        trade: payload.trade,
        owner_name: payload.ownerName,
        phone: payload.phone || null,
      });

      if (insertError) {
        console.error("Error creating business:", insertError);
        // Fall through to profile update
      }
    }

    // Also update profile for legacy support
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        business_name: payload.businessName,
        business_slug: slug,
        business_phone: payload.phone || null,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (profileError) {
      console.error("Error updating profile:", profileError);
      // Try insert if update fails
      const { error: insertProfileError } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          business_name: payload.businessName,
          business_slug: slug,
          business_phone: payload.phone || null,
          onboarding_completed: true,
        });

      if (insertProfileError) {
        console.error("Error inserting profile:", insertProfileError);
      }
    }

    return NextResponse.json({
      success: true,
      businessName: payload.businessName,
      slug: slug,
    });
  } catch (error) {
    console.error("Simple onboarding error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
