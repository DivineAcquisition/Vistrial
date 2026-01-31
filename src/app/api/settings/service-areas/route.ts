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

  const { data: serviceAreas } = await supabase
    .from("service_areas")
    .select("*")
    .eq("business_id", businessId)
    .order("zip");

  return NextResponse.json(serviceAreas);
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
  const { businessId, zips } = body;

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

  // Get existing zips to avoid duplicates
  const { data: existing } = await supabase
    .from("service_areas")
    .select("zip")
    .eq("business_id", businessId);

  const existingZips = new Set(existing?.map((a) => a.zip) || []);
  const newZips = zips.filter((z: string) => !existingZips.has(z));

  if (newZips.length === 0) {
    return NextResponse.json([]);
  }

  // Create service areas
  const { data, error } = await supabase
    .from("service_areas")
    .insert(
      newZips.map((zip: string) => ({
        business_id: businessId,
        zip,
        is_active: true,
      }))
    )
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
