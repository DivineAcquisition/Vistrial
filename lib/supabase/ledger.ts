import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The database handle, passed to every module that writes rather than imported
 * by it, so the whole path can be exercised in tests without a live project.
 */
export type LedgerDb = SupabaseClient;
