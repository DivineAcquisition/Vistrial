import type { SupabaseClient } from "@supabase/supabase-js";

import { runBillingCron } from "@/lib/billing/cron";
import { runAuthorizedCron } from "@/lib/ops/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runAuthorizedCron(request, "billing", (db) => runBillingCron(db as unknown as SupabaseClient));
}
