import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  const status: Record<string, any> = {
    timestamp: new Date().toISOString(),
    environment: {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + "...",
    },
    auth: null,
    business: null,
    errors: [] as string[],
  };

  try {
    // Check user authentication
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError) {
      status.errors.push(`Auth error: ${userError.message}`);
    }

    status.auth = {
      authenticated: !!user,
      userId: user?.id,
      email: user?.email,
      provider: user?.app_metadata?.provider,
    };

    if (user) {
      // Try to get business using normal client
      const { data: businessNormal, error: businessError } = await supabase
        .from("businesses")
        .select("id, name, slug, onboarding_completed, owner_id")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (businessError) {
        status.errors.push(`Business query error (normal): ${businessError.message}`);
      }

      status.business = {
        exists: !!businessNormal,
        data: businessNormal,
      };

      // Try admin client
      if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const admin = createAdminClient();
        const { data: businessAdmin, error: adminError } = await admin
          .from("businesses")
          .select("id, name, slug, onboarding_completed, owner_id")
          .eq("owner_id", user.id)
          .maybeSingle();

        if (adminError) {
          status.errors.push(`Business query error (admin): ${adminError.message}`);
        }

        status.businessAdmin = {
          exists: !!businessAdmin,
          data: businessAdmin,
        };
      }
    }

    // Check if businesses table is accessible
    const { error: tableError } = await supabase
      .from("businesses")
      .select("count")
      .limit(0);

    if (tableError) {
      status.errors.push(`Table access error: ${tableError.message}`);
    } else {
      status.tableAccessible = true;
    }

  } catch (error) {
    status.errors.push(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  }

  return NextResponse.json(status);
}
