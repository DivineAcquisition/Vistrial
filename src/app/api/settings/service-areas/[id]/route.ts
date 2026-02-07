// ============================================
// API route for individual service area operations
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Verify ownership through service area
    const { data: area } = await supabase
      .from("service_areas")
      .select("business_id")
      .eq("id", id)
      .single();

    if (!area) {
      return NextResponse.json(
        { error: "Service area not found" },
        { status: 404 }
      );
    }

    const { data: business } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", area.business_id)
      .eq("owner_id", user.id)
      .single();

    if (!business) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Update service area
    const { data, error } = await supabase
      .from("service_areas")
      .update({
        is_active: body.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating service area:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error updating service area:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify ownership through service area
    const { data: area } = await supabase
      .from("service_areas")
      .select("business_id")
      .eq("id", id)
      .single();

    if (!area) {
      return NextResponse.json(
        { error: "Service area not found" },
        { status: 404 }
      );
    }

    const { data: business } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", area.business_id)
      .eq("owner_id", user.id)
      .single();

    if (!business) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { error } = await supabase
      .from("service_areas")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting service area:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting service area:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
