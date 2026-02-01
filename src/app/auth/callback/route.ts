import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const redirect = searchParams.get("redirect") ?? searchParams.get("next");

  // Handle OAuth errors
  if (error) {
    console.error("OAuth error:", error, errorDescription);
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error)}`);
  }

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("Session exchange error:", exchangeError);
      return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
    }

    if (data.user) {
      console.log("OAuth login successful for user:", data.user.id);
      
      // Check if user has a business
      const { data: business, error: businessError } = await supabase
        .from("businesses")
        .select("id, onboarding_completed")
        .eq("owner_id", data.user.id)
        .maybeSingle();

      if (businessError) {
        console.error("Error checking business:", businessError);
      }

      // If no business exists for this user, redirect to onboarding
      if (!business) {
        console.log("No business found, redirecting to onboarding");
        return NextResponse.redirect(`${origin}/onboarding`);
      }

      // If business exists but onboarding not completed, redirect to onboarding
      if (!business.onboarding_completed) {
        console.log("Onboarding not completed, redirecting to onboarding");
        return NextResponse.redirect(`${origin}/onboarding`);
      }

      // Redirect to the specified location or dashboard
      const destination = redirect || "/dashboard";
      console.log("Redirecting to:", destination);
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  // No code provided - redirect to login
  console.error("No auth code provided in callback");
  return NextResponse.redirect(`${origin}/login?error=no_code`);
}
