// ============================================
// Supabase Admin Client
// Creates a Supabase client with service role privileges
// for operations that bypass RLS
// ============================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Type for the Supabase admin client
export type AdminSupabaseClient = SupabaseClient;

/**
 * Creates a Supabase admin client with service role privileges
 * This client bypasses Row Level Security (RLS) policies
 * Use only for trusted server-side operations
 */
export function createAdminClient(): AdminSupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing Supabase environment variables for admin client");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabase;
}
