import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BusinessHours } from "@/lib/foundation/fields";
import { confirmedFoundation } from "@/lib/foundation/store";
import { businessDayOver, localDay } from "@/lib/manager/eod";
import { draftEods } from "@/lib/manager/store";

/**
 * Hourly. For each Sales OS workspace whose business day has ended, drafts
 * every rep's end of day report once. Each workspace is scoped to its own
 * org id; nothing crosses workspaces. Logs hold counts only.
 */
export async function draftDueEods(db: SupabaseClient, now: number = Date.now()): Promise<{ workspaces: number; drafted: number }> {
  const { data: flags } = await db.from("workspace_flags").select("org_id").eq("flag", "sales_os").eq("enabled", true);
  const orgIds = ((flags ?? []) as Array<{ org_id: string }>).map((row) => row.org_id);
  if (orgIds.length === 0) return { workspaces: 0, drafted: 0 };
  const { data: orgs } = await db.from("organizations").select("id, timezone, status").in("id", orgIds);
  let workspaces = 0;
  let drafted = 0;
  for (const org of (orgs ?? []) as Array<{ id: string; timezone: string | null; status: string }>) {
    if (org.status === "closed") continue;
    const tz = org.timezone || "America/New_York";
    const foundation = await confirmedFoundation(db, org.id);
    const hours = foundation.get("rules.business_hours") as BusinessHours | undefined;
    const day = localDay(now, tz);
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (hours?.days?.length && !hours.days.includes(weekday)) continue;
    if (!businessDayOver(now, tz, hours?.end ?? "18:00")) continue;
    const { count } = await db.from("eod_reports").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("day", day);
    if ((count ?? 0) > 0) continue;
    try {
      drafted += await draftEods(db, org.id, day, tz);
      workspaces += 1;
    } catch {
      console.error(JSON.stringify({ src: "vistrial", event: "eod.draft_failed", org: org.id }));
    }
  }
  return { workspaces, drafted };
}
