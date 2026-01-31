// ============================================
// API route for business profile management
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Verify ownership
    const { data: existingBusiness } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", body.id)
      .eq("owner_id", user.id)
      .single();

    if (!existingBusiness) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    // Update business profile
    const { data, error } = await supabase
      .from("businesses")
      .update({
        name: body.name,
        slug: body.slug,
        phone: body.phone,
        email: body.email,
        address_line1: body.address_line1,
        city: body.city,
        state: body.state,
        zip: body.zip,
        logo_url: body.logo_url,
        website: body.website,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating business profile:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error updating business profile:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
