import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { activityRangeBounds } from "@/lib/activity/filters";
import { parseActivityPage } from "@/lib/activity/parse";
import {
  ACTIVITY_COMPACT_SIZE,
  ACTIVITY_PAGE_SIZE,
  type ActivityActorOption,
  type ActivityCursor,
  type ActivityFilters,
  type ActivityPage,
} from "@/lib/activity/types";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";

function cursorJson(cursor?: ActivityCursor | null): Json | null {
  if (!cursor) return null;
  return {
    at: cursor.at,
    id: cursor.id,
    ...(cursor.failed ? { failed: "1" } : {}),
  };
}

export async function loadOrgActivity(
  filters: ActivityFilters,
  opts?: { cursor?: ActivityCursor | null; limit?: number }
): Promise<ActivityPage> {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  return fetchOrgActivity(supabase, ctx.org.id, filters, opts);
}

export async function fetchOrgActivity(
  supabase: SupabaseClient<Database>,
  orgId: string,
  filters: ActivityFilters,
  opts?: { cursor?: ActivityCursor | null; limit?: number }
): Promise<ActivityPage> {
  const { from, to } = activityRangeBounds(filters);
  const { data, error } = await supabase.rpc("load_org_activity", {
    p_org_id: orgId,
    p_lead_id: null,
    p_actor_user_id: filters.actorUserId,
    p_category: filters.category,
    p_integration: filters.integration,
    p_failures_only: filters.failuresOnly,
    p_include_sync_noise: filters.includeSync,
    p_include_routine: filters.includeRoutine,
    p_q: filters.q,
    p_from: from,
    p_to: to,
    p_limit: opts?.limit ?? ACTIVITY_PAGE_SIZE,
    p_cursor: cursorJson(opts?.cursor ?? null),
  });
  if (error) {
    throw new Error(error.message || "Could not load activity.");
  }
  return parseActivityPage(data);
}

export async function loadOpsActivity(
  filters: ActivityFilters,
  opts?: { cursor?: ActivityCursor | null; limit?: number }
): Promise<ActivityPage> {
  const supabase = await createClient();
  const { from, to } = activityRangeBounds(filters);
  const { data, error } = await supabase.rpc("load_ops_activity", {
    p_org_id: filters.orgId,
    p_failures_only: filters.failuresOnly,
    p_include_sync_noise: filters.includeSync,
    p_include_routine: filters.includeRoutine,
    p_q: filters.q,
    p_from: from,
    p_to: to,
    p_limit: opts?.limit ?? ACTIVITY_PAGE_SIZE,
    p_cursor: cursorJson(opts?.cursor ?? null),
  });
  if (error) {
    throw new Error(error.message || "Could not load portfolio activity.");
  }
  return parseActivityPage(data);
}

export async function loadRecentActivity(limit = ACTIVITY_COMPACT_SIZE): Promise<ActivityPage> {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  return fetchOrgActivity(
    supabase,
    ctx.org.id,
    {
      category: null,
      actorUserId: null,
      integration: null,
      failuresOnly: false,
      includeSync: false,
      includeRoutine: false,
      q: null,
      from: null,
      to: null,
      orgId: null,
    },
    { limit }
  );
}

export async function loadActivityActors(): Promise<ActivityActorOption[]> {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_members")
    .select("user_id, display_name")
    .eq("org_id", ctx.org.id)
    .eq("active", true)
    .order("display_name");
  if (error || !data) return [];
  return data
    .filter((row) => typeof row.user_id === "string" && typeof row.display_name === "string")
    .map((row) => ({ userId: row.user_id, displayName: row.display_name }));
}
