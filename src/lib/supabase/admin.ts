import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
        admin: {
          createUser: async () => ({ data: null, error: null }),
          deleteUser: async () => ({ error: null }),
        },
      },
      from: () => mockChain(),
    } as unknown as ReturnType<typeof createClient>;
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
