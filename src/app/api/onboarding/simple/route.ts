import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface OnboardingPayload {
  trade: string;
  businessName: string;
  ownerName: string;
  phone?: string;
  monthlyQuotes?: string;
  goals?: string[];
  primaryFeature?: string;
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

    const payload: OnboardingPayload = await request.json();

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

    // Update profile
    const { error: updateError } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        email: user.email,
        full_name: payload.ownerName,
        business_name: payload.businessName,
        business_slug: slug,
        phone: payload.phone || null,
        trade: payload.trade,
        monthly_quotes: payload.monthlyQuotes,
        goals: payload.goals,
        primary_feature: payload.primaryFeature,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

    if (updateError) {
      console.error("Profile update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      businessName: payload.businessName,
      slug: slug,
    });
  } catch (error) {
    console.error("Onboarding error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
