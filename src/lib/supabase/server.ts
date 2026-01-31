import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createServerSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a minimal mock client for build time
    const mockResponse = { data: null, error: null };
    const mockChain = (): any => ({
      select: mockChain,
      insert: mockChain,
      update: mockChain,
      delete: mockChain,
      upsert: mockChain,
      eq: mockChain,
      neq: mockChain,
      order: mockChain,
      limit: mockChain,
      single: async () => mockResponse,
      maybeSingle: async () => mockResponse,
    });

    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
        signUp: async () => ({ data: null, error: { message: "Supabase not configured" } }),
        signInWithPassword: async () => ({ data: null, error: { message: "Supabase not configured" } }),
        signOut: async () => ({ error: null }),
        resetPasswordForEmail: async () => ({ error: null }),
        updateUser: async () => ({ data: null, error: null }),
      },
      from: () => mockChain(),
      rpc: async () => mockResponse,
    } as ReturnType<typeof createServerClient>;
  }

  const cookieStore = await cookies();

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Handle cookies in Server Components
          }
        },
      },
    }
  );
}

// Alias for backward compatibility
export const createClient = createServerSupabaseClient;
