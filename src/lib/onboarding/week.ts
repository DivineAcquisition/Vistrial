import "server-only";

import { parseFirstWeekHealth } from "@/lib/onboarding/week-parse";
import type { FirstWeekHealth } from "@/lib/onboarding/types";
import { createClient } from "@/lib/supabase/server";

export { coverageLabel, parseFirstWeekHealth } from "@/lib/onboarding/week-parse";

export async function loadFirstWeekHealth(orgId: string): Promise<FirstWeekHealth | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("first_week_health", { p_org_id: orgId });
  if (error || data == null) return null;
  return parseFirstWeekHealth(data);
}
