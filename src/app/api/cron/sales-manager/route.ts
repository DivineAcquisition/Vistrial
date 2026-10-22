import type { SupabaseClient } from "@supabase/supabase-js";

import { draftDueEods } from "@/lib/manager/jobs";
import { runAuthorizedCron } from "@/lib/ops/jobs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runAuthorizedCron(request, "sales-manager", (db) => draftDueEods(db as unknown as SupabaseClient));
}
