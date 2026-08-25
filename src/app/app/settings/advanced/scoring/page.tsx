import { PageFrame } from "@/components/app/page-frame";
import { ScoringSettings } from "@/app/app/settings/scoring/scoring-settings";
import { OrganizationForm } from "@/app/app/settings/organization/organization-form";
import { AdvancedWriteLock } from "@/components/app/advanced-write-lock";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { answersFromJson, loadScoreConfig, loadScoreMaps } from "@/lib/scoring/store";
import { loadAdvancedAccess } from "@/lib/settings/org";
import { createClient } from "@/lib/supabase/server";
import { SectionHeader } from "@/components/ui/section-header";

function leadName(row: { first_name: string | null; last_name: string | null; email: string | null }) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return name || row.email || "Unnamed lead";
}

export default async function AdvancedScoringPage() {
  const ctx = await requireOrgSettingsManager();
  const access = await loadAdvancedAccess(ctx);
  const supabase = await createClient();

  const [config, maps, leads, ghostRun, orgRow, suggestions, orgAdvanced] = await Promise.all([
    loadScoreConfig(supabase, ctx.org.id),
    loadScoreMaps(supabase, ctx.org.id),
    supabase
      .from("leads")
      .select("id, first_name, last_name, email, current_score, application_answers")
      .eq("org_id", ctx.org.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("ghost_detector_runs")
      .select("evaluated_count, changed_count, ran_at")
      .eq("org_id", ctx.org.id)
      .order("ran_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("organizations").select("holdout_percent").eq("id", ctx.org.id).maybeSingle(),
    supabase
      .from("calibration_suggestions")
      .select("id, evidence_sentence, payload, status")
      .eq("org_id", ctx.org.id)
      .eq("status", "pending")
      .in("kind", ["weights", "threshold"]),
    supabase
      .from("organizations")
      .select("sales_cycle_days, baseline_lookback_days, call_coaching_embargo_hours, operator_agent_batch_cap")
      .eq("id", ctx.org.id)
      .maybeSingle(),
  ]);

  return (
    <PageFrame
      title="Scoring and routing"
      description="Four weights, the ready bar, speed-to-lead, ghost windows, mappings, holdout, and calibration suggestions."
    >
      <AdvancedWriteLock locked={!access.writable}>
      <div className="space-y-10">
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
            holdoutPercent: Number(orgRow.data?.holdout_percent ?? 5),
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
          suggestions={(suggestions.data ?? []).map((row) => ({
            id: row.id,
            evidence: row.evidence_sentence,
            previewPlain:
              row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
                ? String((row.payload as { plain?: string }).plain ?? "") || null
                : null,
          }))}
        />
        <section>
          <SectionHeader
            title="Sales cycle and related clocks"
            hint="These change how reporting and coaching read this workspace. They are not the ready bar."
          />
          <OrganizationForm
            salesCycleDays={orgAdvanced.data?.sales_cycle_days ?? 60}
            baselineLookbackDays={orgAdvanced.data?.baseline_lookback_days ?? 365}
            callCoachingEmbargoHours={orgAdvanced.data?.call_coaching_embargo_hours ?? 48}
            operatorAgentBatchCap={orgAdvanced.data?.operator_agent_batch_cap ?? 10}
          />
        </section>
      </div>
      </AdvancedWriteLock>
    </PageFrame>
  );
}
