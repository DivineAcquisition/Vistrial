// ============================================
// API route to delete a service addon
// DELETE - Remove an addon by ID
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
    const { data: addon } = await supabase
      .from("service_addons")
      .select("business_id")
      .eq("id", id)
      .single();

    if (!addon) {
      return NextResponse.json({ error: "Addon not found" }, { status: 404 });
    }

    const { data: business } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", addon.business_id)
      .eq("owner_id", user.id)
      .single();

    if (!business) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { error } = await supabase
      .from("service_addons")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting addon:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting addon:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
