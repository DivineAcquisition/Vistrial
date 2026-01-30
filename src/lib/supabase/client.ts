import { createBrowserClient } from "@supabase/ssr"

// Create client-side Supabase client
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // During SSR/build, return a mock client if env vars aren't set
  // The actual client calls will happen on the browser
  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a mock that will be replaced on the client
    // This allows components to render during build
    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: new Error("Not configured") }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: new Error("Not configured") }),
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
          order: () => ({
            range: () => ({
              then: async () => ({ data: [], error: null, count: 0 }),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => ({ data: null, error: new Error("Not configured") }),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({
              single: async () => ({ data: null, error: new Error("Not configured") }),
            }),
          }),
        }),
        delete: () => ({
          eq: async () => ({ error: new Error("Not configured") }),
        }),
      }),
      rpc: async () => ({ data: null, error: new Error("Not configured") }),
    } as unknown as ReturnType<typeof createBrowserClient>
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
