import type { Enums } from "@/types/database";

import { calendarDaysBetween, ymdInZone } from "@/lib/scoring/timezone";
import { scoreLeadFromEvent } from "@/lib/scoring/event-apply";
import { loadScoreConfig, type ScoringClient } from "@/lib/scoring/store";

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
  client: ScoringClient,
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

  const config = await loadScoreConfig(client, orgId);
  const { data: leads, error: leadError } = await client
    .from("leads")
    .select("id, status, last_touch_at, opted_in_at, ghost_approaching_at")
    .eq("org_id", orgId);

  if (leadError) {
    throw new Error("Could not load leads for ghost detector.");
  }

  let evaluated = 0;
  let changed = 0;
  const todayKey = ymdInZone(now, org.timezone);

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
      // The next action goes in before the flag, because the flag is what makes
      // this lead a noop on the next run. Flag first and a failed insert here
      // would leave the lead flagged with nothing telling anyone to re-engage,
      // and no later run would fix it. This order fails the other way: the lead
      // stays unflagged and the next run retries, and the unique partial index
      // on open ghost_reengagement rows keeps the retry at one action.
      const { error: actionError } = await client.from("next_actions").insert({
        org_id: orgId,
        lead_id: lead.id,
        action_text: GHOST_REENGAGEMENT_TEXT,
        created_by: "system",
        kind: GHOST_REENGAGEMENT_KIND,
        due_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      });
      // 23505 is the unique index: an open re-engagement action already exists,
      // which is the state we wanted anyway.
      if (actionError && actionError.code !== "23505") {
        console.error("[vistrial] ghost detector could not create the re-engagement action", {
          orgId,
          leadId: lead.id,
          message: actionError.message,
        });
        continue;
      }

      const { error: flagError } = await client
        .from("leads")
        .update({ ghost_approaching_at: now.toISOString() })
        .eq("id", lead.id)
        .eq("org_id", orgId);
      if (flagError) {
        console.error("[vistrial] ghost detector could not flag the lead as approaching", {
          orgId,
          leadId: lead.id,
          message: flagError.message,
        });
        continue;
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

    await scoreLeadFromEvent(client, {
      orgId,
      leadId: lead.id,
      event: "ghost",
      idempotencyKey: `event:ghost:${lead.id}:${todayKey}`,
    });
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
  client: ScoringClient,
  now = new Date()
): Promise<{ evaluated: number; changed: number; orgs: GhostOrgResult[] }> {
  const { data: orgs, error } = await client.from("organizations").select("id");
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
