import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { status } = body;

  // Validate status
  const validStatuses = ["pending", "confirmed", "in_progress", "completed", "cancelled"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Verify ownership - get the booking first
  const { data: booking } = await supabase
    .from("bookings")
    .select("business_id")
    .eq("id", id)
    .single();

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // Check if user owns the business
  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", booking.business_id)
    .eq("owner_id", user.id)
    .single();

  // Also check profiles table for legacy support
  let hasAccess = !!business;
  if (!hasAccess) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .single();

    hasAccess = profile?.id === booking.business_id;
  }

  if (!hasAccess) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Update status
  const { error } = await supabase
    .from("bookings")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, status });
}
