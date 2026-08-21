import { PageFrame } from "@/components/app/page-frame";
import { OrganizationForm } from "@/app/app/settings/organization/organization-form";
import { BaselineSettings } from "@/app/app/settings/integrations/baseline-settings";
import { IntegrationSettings } from "@/app/app/settings/integrations/integration-settings";
import { ScoringSettings } from "@/app/app/settings/scoring/scoring-settings";
import { InviteForm } from "@/app/app/settings/members/members-forms";
import { FollowUpSettingsScreen } from "@/app/app/settings/follow-up/follow-up-settings";
import { FieldMapPreview } from "@/app/app/setup/field-map-preview";
import { ReviewActivateForm } from "@/app/app/setup/review-form";
import { SetupStepNav } from "@/app/app/setup/setup-step-nav";
import { UnsupportedRecorderNote } from "@/app/app/setup/transcript-note";
import { VoiceSamplePanel } from "@/app/app/setup/voice-sample";
import { Panel } from "@/components/ui/panel";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { LOCATION_CLAIMED_MESSAGE } from "@/lib/ghl/constants";
import { fetchCustomFields, getValidAccessToken } from "@/lib/ghl/client";
import { listSessionLocations } from "@/lib/ghl/connect";
import { appUrl, ghlOAuthConfigured } from "@/lib/ghl/env";
import { loadFollowUpHealth } from "@/lib/follow-up/health";
import { loadFollowUpSettings, loadRoutingRules, loadVoiceProfile } from "@/lib/follow-up/load";
import { loadOrgIngestionHealth } from "@/lib/ghl/health";
import { loadOpenUnmatched, loadTranscriptHealth } from "@/lib/transcripts/health";
import { ROLE_EXPLANATIONS, SETUP_STEP_COPY, type SetupStepId } from "@/lib/onboarding/constants";
import { loadOrgSetupState } from "@/lib/onboarding/state";
import { parseSetupStep } from "@/lib/onboarding/steps";
import { answersFromJson, loadScoreConfig, loadScoreMaps } from "@/lib/scoring/store";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

const FLASH_ERRORS: Record<string, string> = {
  location_claimed: LOCATION_CLAIMED_MESSAGE,
  oauth_denied: "The GoHighLevel authorization was cancelled.",
  oauth_invalid: "The connection attempt was invalid. Start again from this page.",
  oauth_expired: "The connection attempt expired. Start again from this page.",
  oauth_no_location: "GoHighLevel did not return a location to link.",
  oauth_failed: "The GoHighLevel connection could not be completed.",
};

function leadName(row: { first_name: string | null; last_name: string | null; email: string | null }) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return name || row.email || "Unnamed lead";
}

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{
    step?: string;
    ghl_error?: string;
    connected?: string;
    select_location?: string;
  }>;
}) {
  const ctx = await requireOrgSettingsManager();
  const params = await searchParams;
  const setup = await loadOrgSetupState(ctx.org.id);
  const current = parseSetupStep(params.step, setup.steps);
  const copy = SETUP_STEP_COPY[current];
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  await supabase.from("org_onboarding").update({ last_visited_step: current }).eq("org_id", ctx.org.id);
  await supabase.from("org_onboarding").update({ last_visited_step: current }).eq("org_id", ctx.org.id);

  return (
    <PageFrame title="Setup" description={copy.why}>
      <SetupStepNav steps={setup.steps} current={current} />
      <Panel className="mb-8 px-6 py-5">
        <p className="text-sm font-semibold text-white">{copy.title}</p>
        <p className={`${helperClass} mt-2`}>{copy.why}</p>
      </Panel>
      <SetupStepBody
        step={current}
        ctx={ctx}
        params={params}
        supabase={supabase}
        admin={admin}
        setup={setup}
      />
    </PageFrame>
  );
}

async function SetupStepBody({
  step,
  ctx,
  params,
  supabase,
  admin,
  setup,
}: {
  step: SetupStepId;
  ctx: Awaited<ReturnType<typeof requireOrgSettingsManager>>;
  params: {
    ghl_error?: string;
    connected?: string;
    select_location?: string;
  };
  supabase: Awaited<ReturnType<typeof createClient>>;
  admin: ReturnType<typeof getSupabaseAdmin>;
  setup: Awaited<ReturnType<typeof loadOrgSetupState>>;
}) {
  if (step === "organization") {
    const { data } = await supabase
      .from("organizations")
      .select("sales_cycle_days, baseline_lookback_days")
      .eq("id", ctx.org.id)
      .maybeSingle();
    return (
      <OrganizationForm
        variant="setup"
        name={ctx.org.name}
        timezone={ctx.org.timezone}
        ghlLocationId={ctx.org.ghlLocationId}
        salesCycleDays={data?.sales_cycle_days ?? 60}
        baselineLookbackDays={data?.baseline_lookback_days ?? 365}
      />
    );
  }

  if (step === "crm" || step === "field_mapping" || step === "transcripts") {
    await getValidAccessToken(admin, ctx.org.id);
    const [connection, health, maps, transcriptHealth, unmatched, followUpHealth] = await Promise.all([
      supabase
        .from("ghl_connections")
        .select("status, location_name, last_verified_at, location_id")
        .eq("org_id", ctx.org.id)
        .maybeSingle(),
      loadOrgIngestionHealth(admin, ctx.org.id),
      supabase
        .from("ghl_field_maps")
        .select("id, ghl_field_id, ghl_field_key, answer_key")
        .eq("org_id", ctx.org.id)
        .order("created_at", { ascending: true }),
      loadTranscriptHealth(admin, ctx.org.id),
      loadOpenUnmatched(admin, ctx.org.id),
      loadFollowUpHealth(admin, ctx.org.id),
    ]);
    const selectLocation = params.select_location === "1";
    const locations = selectLocation ? await listSessionLocations(admin, ctx.org.id, ctx.member.id) : [];
    let customFields: Array<{ id: string; name: string; key?: string }> = [];
    if (connection.data?.status === "active" && connection.data.location_id) {
      try {
        customFields = await fetchCustomFields(admin, ctx.org.id, connection.data.location_id);
      } catch {
        customFields = [];
      }
    }

    const integration = (
      <IntegrationSettings
        oauthConfigured={ghlOAuthConfigured()}
        oauthStartHref="/api/ghl/oauth/start?next=%2Fapp%2Fsetup%3Fstep%3Dcrm"
        selectLocation={selectLocation}
        locations={locations}
        connection={{
          status: connection.data?.status ?? health.connectionStatus,
          locationName: connection.data?.location_name ?? health.locationName,
          lastVerifiedAt: connection.data?.last_verified_at ?? health.lastVerifiedAt,
          lastSetupError: health.lastSetupError,
        }}
        health={{
          receivedLast24h: health.receivedLast24h,
          unprocessed: health.unprocessed,
          oldestUnprocessedAgeMs: health.oldestUnprocessedAgeMs,
          deadCount: health.deadCount,
          dead: health.dead,
          lastProcessedAt: health.lastProcessedAt,
          lastProcessedAgeMs: health.lastProcessedAgeMs,
          stale: health.stale,
          staleReason: health.staleReason,
        }}
        maps={(maps.data ?? []).map((row) => ({
          id: row.id,
          ghlFieldId: row.ghl_field_id ?? "",
          ghlFieldKey: row.ghl_field_key ?? "",
          answerKey: row.answer_key,
        }))}
        customFields={customFields}
        flash={params.connected === "1" ? "GoHighLevel is connected." : null}
        flashError={params.ghl_error ? FLASH_ERRORS[params.ghl_error] ?? FLASH_ERRORS.oauth_failed : null}
        now={new Date().toISOString()}
        appUrl={appUrl()}
        transcriptHealth={{
          unmatchedCount: transcriptHealth.unmatched.count,
          unmatchedOldestAgeMs: transcriptHealth.unmatched.oldestAgeMs,
          deadExtractions: transcriptHealth.deadExtractions.count,
          connections: transcriptHealth.connections,
        }}
        unmatched={unmatched}
        assignableCalls={[]}
        followUpHealth={followUpHealth}
        show={
          step === "crm"
            ? { alerts: true, connection: true, health: false, maps: false, recorders: false }
            : step === "field_mapping"
              ? { alerts: false, connection: false, health: false, maps: true, recorders: false }
              : { alerts: false, connection: false, health: false, maps: false, recorders: true }
        }
      />
    );

    if (step === "field_mapping") {
      const { data: previewLead } = await supabase
        .from("leads")
        .select("first_name, last_name, email, current_score, application_answers")
        .eq("org_id", ctx.org.id)
        .eq("is_test", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (
        <div className="space-y-8">
          {integration}
          <FieldMapPreview
            customFieldCount={customFields.length}
            lead={
              previewLead
                ? {
                    name: leadName(previewLead),
                    currentScore: previewLead.current_score,
                    answers: answersFromJson(previewLead.application_answers),
                  }
                : null
            }
          />
        </div>
      );
    }

    if (step === "transcripts") {
      return (
        <div className="space-y-8">
          {integration}
          <UnsupportedRecorderNote choice={setup.gate.transcriptChoice} />
        </div>
      );
    }

    return integration;
  }

  if (step === "backfill") {
    const [orgRow, baselineRun, selfReported] = await Promise.all([
      supabase.from("organizations").select("activated_at").eq("id", ctx.org.id).maybeSingle(),
      supabase
        .from("baseline_runs")
        .select(
          "status, grade, grade_reasons, progress, window_start, window_end, triggered_at, finished_at, error_text, contacts_seen, contacts_with_created_date, contacts_with_activity, opportunities_seen, opportunities_with_value, payments_seen, discontinuity_detected, discontinuity_month"
        )
        .eq("org_id", ctx.org.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("self_reported_baselines")
        .select("leads_per_month, clients_closed_per_month, stated_at")
        .eq("org_id", ctx.org.id)
        .maybeSingle(),
    ]);
    return (
      <BaselineSettings
        activatedAt={orgRow.data?.activated_at ?? null}
        backfill={{
          status: baselineRun.data?.status ?? null,
          grade: baselineRun.data?.grade ?? null,
          gradeReasons: baselineRun.data?.grade_reasons ?? [],
          progressPhase:
            baselineRun.data?.progress && typeof baselineRun.data.progress === "object"
              ? String((baselineRun.data.progress as { phase?: string }).phase ?? "")
              : null,
          windowStart: baselineRun.data?.window_start ?? null,
          windowEnd: baselineRun.data?.window_end ?? null,
          triggeredAt: baselineRun.data?.triggered_at ?? null,
          finishedAt: baselineRun.data?.finished_at ?? null,
          errorText: baselineRun.data?.error_text ?? null,
          quality: baselineRun.data
            ? {
                contactsSeen: baselineRun.data.contacts_seen,
                contactsWithCreatedDate: baselineRun.data.contacts_with_created_date,
                contactsWithActivity: baselineRun.data.contacts_with_activity,
                opportunitiesSeen: baselineRun.data.opportunities_seen,
                opportunitiesWithValue: baselineRun.data.opportunities_with_value,
                paymentsSeen: baselineRun.data.payments_seen,
                discontinuityDetected: baselineRun.data.discontinuity_detected,
                discontinuityMonth: baselineRun.data.discontinuity_month,
              }
            : null,
        }}
        selfReported={
          selfReported.data
            ? {
                leadsPerMonth: selfReported.data.leads_per_month,
                clientsClosedPerMonth: selfReported.data.clients_closed_per_month,
                statedAt: selfReported.data.stated_at,
              }
            : null
        }
      />
    );
  }

  if (step === "scoring") {
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
    );
  }

  if (step === "team") {
    const { data: members } = await supabase
      .from("org_members")
      .select("id, display_name, email, role, active")
      .eq("org_id", ctx.org.id)
      .eq("active", true)
      .order("created_at", { ascending: true });
    return (
      <div className="space-y-8">
        <Panel className="px-6 py-6">
          <h2 className="text-sm font-semibold text-white">What each role can see</h2>
          <dl className="mt-4 space-y-3">
            {Object.entries(ROLE_EXPLANATIONS).map(([role, explanation]) => (
              <div key={role}>
                <dt className="text-sm capitalize text-white">{role}</dt>
                <dd className={helperClass}>{explanation}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel className="px-6 py-6">
          <h2 className="text-sm font-semibold text-white">Invite</h2>
          <div className="mt-4">
            <InviteForm />
          </div>
        </Panel>
        <Panel className="px-6 py-6">
          <h2 className="text-sm font-semibold text-white">Active members</h2>
          <ul className="mt-3 space-y-2">
            {(members ?? []).map((member) => (
              <li key={member.id} className="text-sm text-silver">
                {member.display_name} · {member.email} · {member.role}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    );
  }

  if (step === "voice") {
    const [settings, voice, rules, suggestions] = await Promise.all([
      loadFollowUpSettings(ctx.org.id),
      loadVoiceProfile(ctx.org.id),
      loadRoutingRules(ctx.org.id),
      supabase
        .from("voice_profile_suggestions")
        .select("id, kind, phrase, evidence, status")
        .eq("org_id", ctx.org.id)
        .order("created_at", { ascending: false }),
    ]);
    return (
      <div className="space-y-8">
        <FollowUpSettingsScreen
          settings={settings}
          voice={voice}
          rules={rules}
          suggestions={(suggestions.data ?? []).map((row) => ({
            id: row.id,
            kind: row.kind,
            phrase: row.phrase,
            evidence:
              row.evidence && typeof row.evidence === "object" && !Array.isArray(row.evidence)
                ? String((row.evidence as { text?: string }).text ?? "")
                : "",
            status: row.status,
          }))}
          show={{ halt: false, examples: true, profile: true, policy: false }}
        />
        <VoiceSamplePanel exampleCount={voice.examples.length} />
      </div>
    );
  }

  return <ReviewActivateForm gate={setup.gate} />;
}
