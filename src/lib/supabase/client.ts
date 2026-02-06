// ============================================
// SUPABASE BROWSER CLIENT
// Used in Client Components
// ============================================

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function getSupabaseBrowserClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // During build/prerender, env vars may not exist.
    // Throw at runtime, but during SSG just return a dummy that won't be called.
    if (typeof window !== 'undefined') {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }
    // SSG/build: return a no-op proxy that won't actually be used
    return new Proxy({} as ReturnType<typeof createBrowserClient<Database>>, {
      get() {
        return () => ({ data: null, error: null });
      },
    });
  }

  client = createBrowserClient<Database>(url, key);
  return client;
}

// Backward compatibility aliases
export const createClient = getSupabaseBrowserClient;
