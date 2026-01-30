import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // During build/SSR, return a mock client if credentials are not available
  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a minimal mock client for build time
    const mockResponse = { data: null, error: { message: "Supabase not configured" } };
    const mockChain = () => ({
      select: mockChain,
      insert: mockChain,
      update: mockChain,
      delete: mockChain,
      eq: mockChain,
      neq: mockChain,
      gt: mockChain,
      gte: mockChain,
      lt: mockChain,
      lte: mockChain,
      like: mockChain,
      ilike: mockChain,
      is: mockChain,
      in: mockChain,
      contains: mockChain,
      containedBy: mockChain,
      range: mockChain,
      order: mockChain,
      limit: mockChain,
      single: async () => mockResponse,
      maybeSingle: async () => mockResponse,
      then: (resolve: (value: typeof mockResponse) => void) => Promise.resolve(mockResponse).then(resolve),
    });

    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
        signUp: async () => ({ data: null, error: { message: "Supabase not configured" } }),
        signInWithPassword: async () => ({ data: null, error: { message: "Supabase not configured" } }),
        signOut: async () => ({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      from: () => mockChain(),
      channel: () => ({
        on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
      }),
    } as ReturnType<typeof createBrowserClient>;
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
