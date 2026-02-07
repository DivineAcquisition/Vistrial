// ============================================
// API route to delete a custom booking field
// DELETE - Remove a custom field by ID
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

    // Verify ownership through business
    const { data: field } = await supabase
      .from("custom_booking_fields")
      .select("business_id")
      .eq("id", id)
      .single();

    if (!field) {
      return NextResponse.json({ error: "Field not found" }, { status: 404 });
    }

    const { data: business } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", field.business_id)
      .eq("owner_id", user.id)
      .single();

    if (!business) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { error } = await supabase
      .from("custom_booking_fields")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting custom field:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting custom field:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
