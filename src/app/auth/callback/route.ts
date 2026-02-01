import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
      
      // Auto-create business if none exists
      await ensureBusinessExists(data.user);

      // Redirect to dashboard (or specified redirect)
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

// Auto-create business for new users
async function ensureBusinessExists(user: any) {
  try {
    const admin = createAdminClient();
    
    // Check if business exists
    const { data: businesses } = await admin
      .from("businesses")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    if (businesses && businesses.length > 0) {
      console.log("Business already exists for user");
      return;
    }

    // Create business
    const userName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "User";
    const businessName = user.user_metadata?.business_name || `${userName}'s Business`;
    const slug = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Date.now().toString(36)}`;

    const { error: insertError } = await admin
      .from("businesses")
      .insert({
        owner_id: user.id,
        name: businessName,
        slug: slug,
        trade: "cleaning",
        email: user.email,
        phone: user.user_metadata?.phone || null,
        primary_color: "#6E47D1",
        settings: {
          timezone: "America/New_York",
          currency: "USD",
          owner_name: userName,
        },
        onboarding_completed: true,
        is_active: true,
      });

    if (insertError) {
      console.error("Failed to create business:", insertError);
    } else {
      console.log("Created business for user:", user.id);
    }
  } catch (err) {
    console.error("Error ensuring business exists:", err);
  }
}
