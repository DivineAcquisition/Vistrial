// ============================================
// Supabase Server Client
// Creates a Supabase client for server-side operations
// ============================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Type for the Supabase client - can be extended with database types
export type ServerSupabaseClient = SupabaseClient;

/**
 * Creates a Supabase client for server-side operations
 * This client uses the service role key and handles auth via cookies
 */
export async function createServerSupabaseClient(): Promise<ServerSupabaseClient> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables");
  }

  const cookieStore = await cookies();

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
    },
    global: {
      headers: {
        cookie: cookieStore.toString(),
      },
    },
  });

  return supabase;
}
