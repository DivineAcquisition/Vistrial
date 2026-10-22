import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export type WorkspaceFlag = "agent_sidebar" | "workflows" | "sales_os";

export async function workspaceFlagOn(db: SupabaseClient, orgId: string, flag: WorkspaceFlag): Promise<boolean> {
  const { data } = await db
    .from("workspace_flags")
    .select("enabled")
    .eq("org_id", orgId)
    .eq("flag", flag)
    .maybeSingle();
  return data?.enabled === true;
}

/** The Sales OS shell is a per-workspace switch. Read once per request. */
export const salesOsEnabled = cache(async (orgId: string): Promise<boolean> => {
  const db = (await createClient()) as unknown as SupabaseClient;
  return workspaceFlagOn(db, orgId, "sales_os").catch(() => false);
});

/** Owners, staff in the workspace, and members an Owner made a Manager. */
export const isTeamManager = cache(async (orgId: string): Promise<boolean> => {
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data, error } = await db.rpc("is_team_manager", { p_org_id: orgId });
  return !error && data === true;
});
