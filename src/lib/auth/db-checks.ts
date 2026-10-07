import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Ask the database, through the caller's own session, before a server action
 * acts with the service role. The answer comes from the same functions the
 * row-level policies use, so the screen and the data layer cannot disagree.
 * Any error reads as "no".
 */
async function check(fn: "ws_can_approve" | "ws_is_staff", orgId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, { p_org_id: orgId });
  return !error && data === true;
}

export function dbCanApprove(orgId: string): Promise<boolean> {
  return check("ws_can_approve", orgId);
}

export function dbIsStaff(orgId: string): Promise<boolean> {
  return check("ws_is_staff", orgId);
}

export async function dbCanWorkLead(orgId: string, leadId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ws_can_work_lead", { p_org_id: orgId, p_lead_id: leadId });
  return !error && data === true;
}
