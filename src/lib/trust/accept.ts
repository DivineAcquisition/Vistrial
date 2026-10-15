import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Record the privacy and terms versions this person has been shown. Joining still succeeds if the write fails. */
export async function recordLegalAcceptance(userId: string): Promise<void> {
  if (!userId) return;
  try {
    const db = getSupabaseAdmin() as unknown as SupabaseClient;
    await db.rpc("record_legal_acceptance", { p_user: userId });
  } catch {
    /* acceptance must not block account creation or an invite */
  }
}
