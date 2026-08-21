"use client";

import { createBrowserClient } from "@supabase/ssr";

import { requireSupabaseBrowserEnv } from "@/lib/supabase/env";
import { fetchForSupabaseKey } from "@/lib/supabase/fetch";
import type { Database } from "@/types/database";

export function createClient() {
  const { url, key } = requireSupabaseBrowserEnv();
  return createBrowserClient<Database>(url, key, {
    global: { fetch: fetchForSupabaseKey(key) },
  });
}
