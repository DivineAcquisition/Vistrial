// ============================================
// API route for service add-ons
// GET - Retrieve all addons for a business
// POST - Create a new addon
// PUT - Update an existing addon
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get("businessId");

    if (!businessId) {
      return NextResponse.json(
        { error: "Business ID required" },
        { status: 400 }
      );
    }

    const { data: addons, error } = await supabase
      .from("service_addons")
      .select("*")
      .eq("business_id", businessId)
      .order("display_order");

    if (error) {
      console.error("Error fetching addons:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(addons);
  } catch (error) {
    console.error("Error fetching addons:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { businessId, addon } = body;

    if (!businessId || !addon) {
      return NextResponse.json(
        { error: "Business ID and addon data are required" },
        { status: 400 }
      );
    }

    // Verify ownership
    const { data: business } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", businessId)
      .eq("owner_id", user.id)
      .single();

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    // Get max display order
    const { data: existing } = await supabase
      .from("service_addons")
      .select("display_order")
      .eq("business_id", businessId)
      .order("display_order", { ascending: false })
      .limit(1);

    const maxOrder = existing?.[0]?.display_order || 0;

    // Create addon
    const { data, error } = await supabase
      .from("service_addons")
      .insert({
        business_id: businessId,
        ...addon,
        display_order: maxOrder + 1,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating addon:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error creating addon:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

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
    const { businessId, addon } = body;

    if (!businessId || !addon || !addon.id) {
      return NextResponse.json(
        { error: "Business ID and addon data with ID are required" },
        { status: 400 }
      );
    }

    // Verify ownership
    const { data: business } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", businessId)
      .eq("owner_id", user.id)
      .single();

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("service_addons")
      .update({
        ...addon,
        updated_at: new Date().toISOString(),
      })
      .eq("id", addon.id)
      .eq("business_id", businessId)
      .select()
      .single();

    if (error) {
      console.error("Error updating addon:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error updating addon:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
