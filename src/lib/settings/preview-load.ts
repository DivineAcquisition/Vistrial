import "server-only";

import { factorsFromScoreRow } from "@/lib/scoring/store";
import type { ScoringPreviewLead } from "@/lib/settings/preview";
import { createClient } from "@/lib/supabase/server";

function leadName(row: { first_name: string | null; last_name: string | null; email: string | null }) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return name || row.email || "Unnamed lead";
}

const OPEN = new Set(["new", "working", "nurture"]);

/**
 * Current open leads plus the latest stored factors. Preview recomputes from
 * those factors; it does not write score rows.
 */
export async function loadScoringPreviewLeads(orgId: string): Promise<ScoringPreviewLead[]> {
  const supabase = await createClient();
  const [{ data: leads }, { data: scores }, { data: actions }] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id, first_name, last_name, email, current_score, lead_type, is_holdout, first_human_touch_at, last_touch_at, opted_in_at, ghost_approaching_at, status"
      )
      .eq("org_id", orgId),
    supabase
      .from("readiness_scores")
      .select(
        "lead_id, timeline_raw, investment_capacity_raw, decision_authority_raw, pain_severity_raw, created_at"
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("next_actions")
      .select("lead_id, due_at")
      .eq("org_id", orgId)
      .is("completed_at", null),
  ]);

  const latestScore = new Map<
    string,
    {
      timeline_raw: number | null;
      investment_capacity_raw: number | null;
      decision_authority_raw: number | null;
      pain_severity_raw: number | null;
    }
  >();
  for (const row of scores ?? []) {
    if (!latestScore.has(row.lead_id)) latestScore.set(row.lead_id, row);
  }

  const dueByLead = new Map<string, string>();
  for (const row of actions ?? []) {
    if (!row.due_at) continue;
    const current = dueByLead.get(row.lead_id);
    if (!current || row.due_at < current) dueByLead.set(row.lead_id, row.due_at);
  }

  return (leads ?? [])
    .filter((lead) => OPEN.has(lead.status))
    .map((lead) => {
      const scoreRow = latestScore.get(lead.id);
      return {
        id: lead.id,
        name: leadName(lead),
        currentScore: lead.current_score,
        leadType: lead.lead_type,
        isHoldout: lead.is_holdout,
        firstHumanTouchAt: lead.first_human_touch_at,
        lastTouchAt: lead.last_touch_at,
        optedInAt: lead.opted_in_at,
        nextActionDueAt: dueByLead.get(lead.id) ?? null,
        ghostApproachingAt: lead.ghost_approaching_at,
        status: lead.status,
        factors: scoreRow
          ? factorsFromScoreRow(scoreRow)
          : {
              timeline: null,
              investment_capacity: null,
              decision_authority: null,
              pain_severity: null,
            },
      };
    });
}
