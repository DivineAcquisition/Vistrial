import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirect = searchParams.get("redirect") ?? searchParams.get("next");

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Check if user has a business
      const { data: business } = await supabase
        .from("businesses")
        .select("id, onboarding_completed")
        .eq("owner_id", data.user.id)
        .maybeSingle();

      // If no business exists for this user, redirect to onboarding
      if (!business) {
        return NextResponse.redirect(`${origin}/onboarding`);
      }

      // If business exists but onboarding not completed, redirect to onboarding
      if (!business.onboarding_completed) {
        return NextResponse.redirect(`${origin}/onboarding`);
      }

      // Redirect to the specified location or dashboard
      const destination = redirect || "/dashboard";
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
