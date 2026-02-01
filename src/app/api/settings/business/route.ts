import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

// GET - Fetch business settings
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: business, error } = await supabase
      .from("businesses")
      .select("*")
      .eq("owner_id", user.id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ business });
  } catch (error) {
    console.error("Get business error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT - Update business settings
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const admin = createAdminClient();

    // Get current business
    const { data: currentBusiness } = await supabase
      .from("businesses")
      .select("id")
      .eq("owner_id", user.id)
      .single();

    if (!currentBusiness) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    // Update business
    const { data: business, error } = await admin
      .from("businesses")
      .update({
        name: body.name,
        phone: body.phone,
        email: body.email,
        address_line1: body.address_line1,
        city: body.city,
        state: body.state,
        zip: body.zip,
        website: body.website,
        settings: body.settings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", currentBusiness.id)
      .select()
      .single();

    if (error) {
      console.error("Update business error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ business });
  } catch (error) {
    console.error("Update business error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
