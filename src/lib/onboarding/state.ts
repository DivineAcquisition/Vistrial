import "server-only";

import { parseOrgSetupState } from "@/lib/onboarding/gate";
import type { OrgSetupState } from "@/lib/onboarding/types";
import { createClient } from "@/lib/supabase/server";

export async function loadOrgSetupState(orgId: string): Promise<OrgSetupState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("load_org_setup_state", { p_org_id: orgId });
  if (error) throw new Error(error.message || "Could not load setup.");
  const parsed = parseOrgSetupState(data);
  if (!parsed) throw new Error("Could not load setup.");
  return parsed;
}
