import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function PUT(
  request: NextRequest,
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

  const body = await request.json();

  // Verify ownership through service area
  const { data: serviceArea } = await supabase
    .from("service_areas")
    .select("business_id")
    .eq("id", id)
    .single();

  if (!serviceArea) {
    return NextResponse.json(
      { error: "Service area not found" },
      { status: 404 }
    );
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", serviceArea.business_id)
    .eq("owner_id", user.id)
    .single();

  if (!business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

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

  // Verify ownership through service area
  const { data: serviceArea } = await supabase
    .from("service_areas")
    .select("business_id")
    .eq("id", id)
    .single();

  if (!serviceArea) {
    return NextResponse.json(
      { error: "Service area not found" },
      { status: 404 }
    );
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", serviceArea.business_id)
    .eq("owner_id", user.id)
    .single();

  if (!business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await supabase.from("service_areas").delete().eq("id", id);

  return NextResponse.json({ success: true });
}
