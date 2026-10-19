import type { SupabaseClient } from "@supabase/supabase-js";

import { calendarDaysBetween } from "@/lib/scoring/timezone";
import { AUTOMATION_STATUSES } from "@/lib/workspaces/status";
import type { Database, Enums } from "@/types/database";

type GhostClient = SupabaseClient<Database>;

/** Going-quiet days for the ghost detector. Scores are Assay's; this only marks status. */
async function loadGhostDays(client: GhostClient, orgId: string): Promise<{ ghostDaysSoft: number; ghostDaysHard: number }> {
  const { data, error } = await client
    .from("score_configs")
    .select("ghost_days_soft, ghost_days_hard")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error || !data) throw new Error("This workspace has no going-quiet settings.");
  return { ghostDaysSoft: data.ghost_days_soft, ghostDaysHard: data.ghost_days_hard };
}

export const GHOST_REENGAGEMENT_KIND = "ghost_reengagement";
export const GHOST_REENGAGEMENT_TEXT =
  "Reach out again. This person has gone quiet.";

const SKIP_STATUSES = new Set<Enums<"lead_status">>(["closed_won", "closed_lost"]);

export type GhostDecision = "noop" | "flag" | "ghost" | "clear";

export function decideGhostAction(input: {
  status: Enums<"lead_status">;
  daysSilent: number;
  softDays: number;
  hardDays: number;
  approachingAt: string | null;
}): GhostDecision {
  if (SKIP_STATUSES.has(input.status)) return "noop";
  if (input.daysSilent >= input.hardDays) {
    return input.status === "ghost" ? "noop" : "ghost";
  }
  if (input.daysSilent >= input.softDays) {
    return input.approachingAt ? "noop" : "flag";
  }
  return input.approachingAt ? "clear" : "noop";
}

export type GhostOrgResult = {
  orgId: string;
  evaluated: number;
  changed: number;
};

export async function runGhostDetectorForOrg(
  client: GhostClient,
  orgId: string,
  now = new Date()
): Promise<GhostOrgResult> {
  const { data: org, error: orgError } = await client
    .from("organizations")
    .select("id, timezone")
    .eq("id", orgId)
    .maybeSingle();

  if (orgError || !org) {
    throw new Error("Organization not found for ghost detector.");
  }

  const config = await loadGhostDays(client, orgId);
  const { data: leads, error: leadError } = await client
    .from("leads")
    .select("id, status, last_touch_at, opted_in_at, ghost_approaching_at")
    .eq("org_id", orgId);

  if (leadError) {
    throw new Error("Could not load leads for ghost detector.");
  }

  let evaluated = 0;
  let changed = 0;

  for (const lead of leads ?? []) {
    if (SKIP_STATUSES.has(lead.status)) continue;
    evaluated += 1;

    const lastActivity = new Date(lead.last_touch_at ?? lead.opted_in_at);
    const daysSilent = calendarDaysBetween(lastActivity, now, org.timezone);
    const decision = decideGhostAction({
      status: lead.status,
      daysSilent,
      softDays: config.ghostDaysSoft,
      hardDays: config.ghostDaysHard,
      approachingAt: lead.ghost_approaching_at,
    });

    if (decision === "noop") continue;

    if (decision === "clear") {
      const { error } = await client
        .from("leads")
        .update({ ghost_approaching_at: null })
        .eq("id", lead.id)
        .eq("org_id", orgId);
      if (error) continue;
      await client
        .from("next_actions")
        .update({ completed_at: now.toISOString() })
        .eq("org_id", orgId)
        .eq("lead_id", lead.id)
        .eq("kind", GHOST_REENGAGEMENT_KIND)
        .is("completed_at", null);
      changed += 1;
      continue;
    }

    if (decision === "flag") {
      const { error: flagError } = await client
        .from("leads")
        .update({ ghost_approaching_at: now.toISOString() })
        .eq("id", lead.id)
        .eq("org_id", orgId);
      if (flagError) continue;

      const { error: actionError } = await client.from("next_actions").insert({
        org_id: orgId,
        lead_id: lead.id,
        action_text: GHOST_REENGAGEMENT_TEXT,
        created_by: "system",
        kind: GHOST_REENGAGEMENT_KIND,
        due_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      });
      if (actionError && actionError.code !== "23505") {
        // Unique index already held — still a successful flag.
      }
      changed += 1;
      continue;
    }

    const { error: ghostError } = await client
      .from("leads")
      .update({ status: "ghost", ghost_approaching_at: null })
      .eq("id", lead.id)
      .eq("org_id", orgId);
    if (ghostError) continue;
    // The status change queues an Assay rescore; silence already counts there.
    changed += 1;
  }

  const { error: logError } = await client.from("ghost_detector_runs").insert({
    org_id: orgId,
    evaluated_count: evaluated,
    changed_count: changed,
    ran_at: now.toISOString(),
  });
  if (logError) {
    console.error("[vistrial] ghost detector failed to log run", {
      orgId,
      evaluated,
      changed,
      message: logError.message,
    });
  }

  console.info("[vistrial] ghost detector", { orgId, evaluated, changed });
  return { orgId, evaluated, changed };
}

export async function runGhostDetector(
  client: GhostClient,
  now = new Date()
): Promise<{ evaluated: number; changed: number; orgs: GhostOrgResult[] }> {
  const { data: orgs, error } = await client.from("organizations").select("id").in("status", AUTOMATION_STATUSES);
  if (error) {
    throw new Error("Could not list organizations for ghost detector.");
  }

  const results: GhostOrgResult[] = [];
  for (const org of orgs ?? []) {
    results.push(await runGhostDetectorForOrg(client, org.id, now));
  }

  const evaluated = results.reduce((sum, row) => sum + row.evaluated, 0);
  const changed = results.reduce((sum, row) => sum + row.changed, 0);
  console.info("[vistrial] ghost detector finished", { evaluated, changed, orgs: results.length });
  return { evaluated, changed, orgs: results };
}
