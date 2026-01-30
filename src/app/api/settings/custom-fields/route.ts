import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { searchParams } = new URL(request.url);
  const businessId = searchParams.get("businessId");

  if (!businessId) {
    return NextResponse.json(
      { error: "Business ID required" },
      { status: 400 }
    );
  }

  const { data: fields } = await supabase
    .from("custom_booking_fields")
    .select("*")
    .eq("business_id", businessId)
    .order("display_order");

  return NextResponse.json(fields);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { businessId, field } = body;

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
    .from("custom_booking_fields")
    .select("display_order")
    .eq("business_id", businessId)
    .order("display_order", { ascending: false })
    .limit(1);

  const maxOrder = existing?.[0]?.display_order || 0;

  // Format options if provided
  const options = field.options?.length
    ? field.options
        .filter(Boolean)
        .map((opt: string) => ({
          value: opt.toLowerCase().replace(/\s+/g, "_"),
          label: opt,
        }))
    : null;

  // Create field
  const { data, error } = await supabase
    .from("custom_booking_fields")
    .insert({
      business_id: businessId,
      field_key: field.field_key,
      label: field.label,
      field_type: field.field_type,
      is_required: field.is_required,
      show_on_step: field.show_on_step,
      options,
      display_order: maxOrder + 1,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PUT(request: NextRequest) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { businessId, field } = body;

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
    .from("custom_booking_fields")
    .update({
      ...field,
      updated_at: new Date().toISOString(),
    })
    .eq("id", field.id)
    .eq("business_id", businessId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
