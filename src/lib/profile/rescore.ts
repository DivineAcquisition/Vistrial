import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Ask Assay to rescore every lead under the configuration a stage just wrote.
 *
 * The qualification stage promises to show how real leads score under what
 * the business just described, so the leads have to be scored under it. The
 * rescore is silent: it changes numbers and tiers, never starts a task,
 * alert, or draft. Earlier scores stay in each lead's score history.
 */
export async function rescoreOrgLeads(client: SupabaseClient<Database>, args: { orgId: string }): Promise<void> {
  const { error } = await (client as unknown as SupabaseClient).rpc("assay_request_workspace_rescore", {
    p_org_id: args.orgId,
    p_reason: "manual",
  });
  if (error) throw new Error("The leads could not be queued for a new score.");
}
