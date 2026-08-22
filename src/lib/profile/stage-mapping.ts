import type { SupabaseClient } from "@supabase/supabase-js";

import { parseStageMeanings } from "@/lib/profile/parse";
import type { Database, Enums } from "@/types/database";

type Db = SupabaseClient<Database>;

/**
 * closed_won is deliberately not mappable. It follows a recorded payment, and
 * the database refuses a manual move into it. A CRM stage called "won" moving
 * the lead here would put revenue in the reporting that nobody was paid.
 */
const UNMAPPABLE: ReadonlySet<string> = new Set(["closed_won"]);

export function statusForStage(
  meanings: Array<{ crmStage: string; means: Enums<"lead_status"> | null }>,
  stage: string
): Enums<"lead_status"> | null {
  const needle = stage.trim().toLowerCase();
  if (!needle) return null;
  const hit = meanings.find((row) => row.crmStage.trim().toLowerCase() === needle);
  if (!hit?.means || UNMAPPABLE.has(hit.means)) return null;
  return hit.means;
}

export async function leadStatusForPipelineStage(
  db: Db,
  orgId: string,
  stage: string
): Promise<Enums<"lead_status"> | null> {
  const { data } = await db
    .from("business_profiles")
    .select("pipeline_stage_meanings")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) return null;
  return statusForStage(parseStageMeanings(data.pipeline_stage_meanings), stage);
}
