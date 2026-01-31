import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    // Return a minimal mock client for build time
    const mockResponse = { data: null, error: { message: "Supabase not configured" } };
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
      then: (resolve: (value: typeof mockResponse) => void) => Promise.resolve(mockResponse).then(resolve),
    });

    return {
      from: () => mockChain(),
      rpc: async () => mockResponse,
      auth: {
        admin: {
          createUser: async () => mockResponse,
          deleteUser: async () => mockResponse,
          listUsers: async () => ({ data: { users: [] }, error: null }),
        },
      },
    } as unknown as ReturnType<typeof createClient>;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
