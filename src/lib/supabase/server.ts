import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export async function createServerSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // During build time, return a mock client if credentials are not available
  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a minimal mock client for build time
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
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: null }),
            order: () => ({ data: [], error: null }),
          }),
          single: async () => ({ data: null, error: null }),
          order: () => ({ data: [], error: null }),
        }),
        insert: async () => ({ data: null, error: null }),
        update: () => ({
          eq: () => ({ data: null, error: null }),
        }),
        delete: () => ({
          eq: () => ({ data: null, error: null }),
        }),
      }),
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

// Admin client with service role (bypass RLS)
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    // Return a minimal mock client for build time
    const mockResponse = { data: null, error: { message: "Supabase not configured" } };
    const mockChain = () => ({
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
      then: (resolve: (value: typeof mockResponse) => void) => Promise.resolve(mockResponse).then(resolve),
    });

    return {
      from: () => mockChain(),
      rpc: async () => mockResponse,
    } as unknown as ReturnType<typeof createSupabaseClient>;
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
