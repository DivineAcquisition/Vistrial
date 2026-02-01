import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ user: null, business: null });
    }

    // Check for existing business
    const { data: business } = await supabase
      .from("businesses")
      .select("id, name, onboarding_completed")
      .eq("owner_id", user.id)
      .maybeSingle();

    return NextResponse.json({ user, business });
  } catch (error) {
    console.error("Auth check error:", error);
    return NextResponse.json({ user: null, business: null }, { status: 500 });
  }
}
