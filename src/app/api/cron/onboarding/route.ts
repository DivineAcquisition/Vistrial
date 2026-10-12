import type { SupabaseClient } from "@supabase/supabase-js";

import { runOnboarding } from "@/lib/onboarding/cron";
import { runAuthorizedCron } from "@/lib/ops/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runAuthorizedCron(request, "onboarding", (db) => runOnboarding(db as unknown as SupabaseClient));
}
