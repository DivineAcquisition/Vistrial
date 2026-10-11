import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/** The caller's own session, untyped, for staff RPCs that are not in the generated Database type. */
export async function staffDb(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

export function dbMessage(error: { message?: string } | null, fallback: string): string {
  const message = error?.message?.trim();
  if (!message) return fallback;
  return /^[A-Z][^\n]{3,240}\.$/.test(message) ? message : fallback;
}
