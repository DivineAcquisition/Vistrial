import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Whether the signed-in person may read what was said on calls: transcript
 * text, quotes, and objection wording. Owners, Operators (on the leads they
 * can open) and staff may; a Member only when an Owner has switched on
 * "Can see transcripts". The database answers, so this and its own checks
 * never disagree. On any trouble, the answer is no.
 */
export async function canSeeTranscripts(db: SupabaseClient | { rpc: SupabaseClient["rpc"] }, orgId: string): Promise<boolean> {
  const { data, error } = await (db as SupabaseClient).rpc("ws_can_see_transcripts", { p_org_id: orgId });
  return !error && data === true;
}
