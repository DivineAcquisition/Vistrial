// @ts-nocheck
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Check if user has a business
      const { data: business } = await supabase
        .from("businesses")
        .select("id")
        .eq("owner_id", data.user.id)
        .maybeSingle();

      // If no business, create one for Google OAuth users
      if (!business) {
        const admin = createAdminClient();
        const fullName =
          data.user.user_metadata?.full_name ||
          data.user.email?.split("@")[0] ||
          "User";
        
        const baseSlug = fullName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 50);

        let slug = baseSlug;
        let counter = 1;
        while (true) {
          const { data: existing } = await admin
            .from("businesses")
            .select("id")
            .eq("slug", slug)
            .maybeSingle();
          if (!existing) break;
          slug = `${baseSlug}-${counter}`;
          counter++;
        }

        await admin.from("businesses").insert({
          owner_id: data.user.id,
          name: `${fullName}'s Business`,
          slug,
          email: data.user.email,
          is_active: true,
        });
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
