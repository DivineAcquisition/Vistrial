import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Return a mock client for build time
    const mockChain = (): any => ({
      select: mockChain,
      insert: mockChain,
      update: mockChain,
      delete: mockChain,
      upsert: mockChain,
      eq: mockChain,
      neq: mockChain,
      gt: mockChain,
      gte: mockChain,
      lt: mockChain,
      lte: mockChain,
      order: mockChain,
      limit: mockChain,
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
    });

    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
        signUp: async () => ({ data: null, error: { message: "Not configured" } }),
        signInWithPassword: async () => ({ data: null, error: { message: "Not configured" } }),
        signInWithOAuth: async () => ({ data: null, error: { message: "Not configured" } }),
        signOut: async () => ({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      from: () => mockChain(),
    } as ReturnType<typeof createBrowserClient>;
  }

  return createBrowserClient(url, key);
}
