"use server";

import { fetchOrgActivity, loadOpsActivity } from "@/lib/activity/load";
import {
  ACTIVITY_PAGE_SIZE,
  type ActivityCursor,
  type ActivityFilters,
  type ActivityPage,
} from "@/lib/activity/types";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function refreshOrgActivity(
  filters: ActivityFilters,
  opts?: { cursor?: ActivityCursor | null; limit?: number }
): Promise<ActivityPage> {
  const ctx = await getAuthContext();
  return fetchOrgActivity(await createClient(), ctx.org.id, filters, {
    cursor: opts?.cursor ?? null,
    limit: opts?.limit ?? ACTIVITY_PAGE_SIZE,
  });
}

export async function refreshOpsActivity(
  filters: ActivityFilters,
  opts?: { cursor?: ActivityCursor | null; limit?: number }
): Promise<ActivityPage> {
  return loadOpsActivity(filters, opts);
}

export async function refreshRecentActivity(): Promise<ActivityPage> {
  const ctx = await getAuthContext();
  return fetchOrgActivity(
    await createClient(),
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
    { limit: 6 }
  );
}
