import type { SupabaseClient } from "@supabase/supabase-js";

import { runStaffWorkspace } from "@/lib/staff/cron";
import { runAuthorizedCron } from "@/lib/ops/jobs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runAuthorizedCron(request, "staff-workspace", (db) => runStaffWorkspace(db as unknown as SupabaseClient));
}
