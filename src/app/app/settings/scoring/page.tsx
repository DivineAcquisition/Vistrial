import { PageFrame } from "@/components/app/page-frame";
import { ScoringSettings } from "@/app/app/settings/scoring/scoring-settings";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { answersFromJson, loadScoreConfig, loadScoreMaps } from "@/lib/scoring/store";
import { createClient } from "@/lib/supabase/server";

function leadName(row: { first_name: string | null; last_name: string | null; email: string | null }) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return name || row.email || "Unnamed lead";
}

export default async function ScoringSettingsPage() {
  const ctx = await requireOrgSettingsManager();
  const supabase = await createClient();

  const [config, maps, leads, ghostRun] = await Promise.all([
    loadScoreConfig(supabase, ctx.org.id),
    loadScoreMaps(supabase, ctx.org.id),
    supabase
      .from("leads")
      .select("id, first_name, last_name, email, current_score, application_answers")
      .eq("org_id", ctx.org.id)
      .eq("is_test", false)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("ghost_detector_runs")
      .select("evaluated_count, changed_count, ran_at")
      .eq("org_id", ctx.org.id)
      .order("ran_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <PageFrame
      title="Scoring"
      description="Readiness weights, application mappings, and ghost thresholds for this workspace."
    >
      <ScoringSettings
        config={{
          timeline: config.weights.timeline,
          investment_capacity: config.weights.investment_capacity,
          decision_authority: config.weights.decision_authority,
          pain_severity: config.weights.pain_severity,
          readyThreshold: config.readyThreshold,
          speedToLeadMinutes: config.speedToLeadMinutes,
          ghostDaysSoft: config.ghostDaysSoft,
          ghostDaysHard: config.ghostDaysHard,
        }}
        maps={maps}
        leads={(leads.data ?? []).map((lead) => ({
          id: lead.id,
          name: leadName(lead),
          currentScore: lead.current_score,
          answers: answersFromJson(lead.application_answers),
        }))}
        lastGhostRun={
          ghostRun.data
            ? {
                evaluated: ghostRun.data.evaluated_count,
                changed: ghostRun.data.changed_count,
                ranAt: ghostRun.data.ran_at,
              }
            : null
        }
      />
    </PageFrame>
  );
}
