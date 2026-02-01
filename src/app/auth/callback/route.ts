import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Domain configuration
const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || "vistrial.io";
const APP_URL = `https://app.${BASE_DOMAIN}`;
const ACCESS_URL = `https://access.${BASE_DOMAIN}`;

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const redirect = searchParams.get("redirect") ?? searchParams.get("next");

  // Determine if we should use cross-domain redirects (production) or same-origin (localhost)
  const isLocalhost = origin.includes("localhost") || origin.includes("127.0.0.1");
  const appOrigin = isLocalhost ? origin : APP_URL;
  const accessOrigin = isLocalhost ? origin : ACCESS_URL;

  // Handle OAuth errors
  if (error) {
    console.error("OAuth error:", error, errorDescription);
    return NextResponse.redirect(`${accessOrigin}/login?error=${encodeURIComponent(error)}`);
  }

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("Session exchange error:", exchangeError);
      return NextResponse.redirect(`${accessOrigin}/login?error=auth_callback_error`);
    }

    if (data.user) {
      console.log("OAuth login successful for user:", data.user.id);
      
      // Check if user has a business (handle duplicates)
      const { data: businesses, error: businessError } = await supabase
        .from("businesses")
        .select("id, onboarding_completed")
        .eq("owner_id", data.user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (businessError) {
        console.error("Error checking business:", businessError);
      }

      const business = businesses?.[0] || null;

      // Redirect to app domain for onboarding or dashboard
      if (!business || !business.onboarding_completed) {
        console.log("No business or onboarding not completed, redirecting to onboarding");
        return NextResponse.redirect(`${appOrigin}/onboarding`);
      }

      // Redirect to the specified location or dashboard
      // If redirect URL is provided and is a full URL, use it; otherwise prepend app origin
      let destination = redirect || "/dashboard";
      if (destination.startsWith("http")) {
        return NextResponse.redirect(destination);
      }
      
      console.log("Redirecting to:", `${appOrigin}${destination}`);
      return NextResponse.redirect(`${appOrigin}${destination}`);
    }
  }

  // No code provided - redirect to login
  console.error("No auth code provided in callback");
  return NextResponse.redirect(`${accessOrigin}/login?error=no_code`);
}
