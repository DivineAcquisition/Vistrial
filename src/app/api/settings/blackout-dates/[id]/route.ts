import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership through blackout date
  const { data: blackout } = await supabase
    .from("blackout_dates")
    .select("business_id")
    .eq("id", id)
    .single();

  if (!blackout) {
    return NextResponse.json(
      { error: "Blackout date not found" },
      { status: 404 }
    );
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", blackout.business_id)
    .eq("owner_id", user.id)
    .single();

  if (!business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await supabase.from("blackout_dates").delete().eq("id", id);

  return NextResponse.json({ success: true });
}
