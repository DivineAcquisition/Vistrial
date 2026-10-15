import "server-only";

import { EXPORT_BUCKET } from "@/lib/portal/export";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function purgeExpiredExports(): Promise<{ removed: number }> {
  const admin = getSupabaseAdmin();
  const client = admin as unknown as SupabaseClient;
  const { data, error } = await client.rpc("expired_export_paths");
  if (error) throw new Error(error.message);
  let removed = 0;
  for (const row of (data ?? []) as Array<{ bucket: string; path: string; job_id: string; source: string }>) {
    if (row.path) {
      await admin.storage.from(row.bucket || EXPORT_BUCKET).remove([row.path]);
    }
    await client.rpc("mark_export_purged", { p_source: row.source, p_id: row.job_id });
    removed += 1;
  }
  return { removed };
}
