import { redirect } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { IntegrationSettings } from "@/app/app/settings/integrations/integration-settings";
import { BaselineSettings } from "@/app/app/settings/integrations/baseline-settings";
import { OrgAlertChannelsForm } from "@/app/app/settings/notifications/org-alert-channels-form";
import { MappingRecordPreview } from "@/app/app/settings/integrations/mapping-record-preview";
import { TestConnectionForm } from "@/app/app/settings/integrations/test-connection-form";
import { AdvancedWriteLock } from "@/components/app/advanced-write-lock";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { loadAdvancedAccess } from "@/lib/settings/org";
import { LOCATION_CLAIMED_MESSAGE } from "@/lib/ghl/constants";
import { fetchCustomFields } from "@/lib/ghl/client";
import { listSessionLocations } from "@/lib/ghl/connect";
import { appUrl, ghlOAuthConfigured } from "@/lib/ghl/env";
import { loadFollowUpHealth } from "@/lib/follow-up/health";
import { loadOrgIngestionHealth } from "@/lib/ghl/health";
import { loadOpenUnmatched, loadTranscriptHealth } from "@/lib/transcripts/health";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { SectionHeader } from "@/components/ui/section-header";

const FLASH_ERRORS: Record<string, string> = {
  location_claimed: LOCATION_CLAIMED_MESSAGE,
  oauth_denied: "The GoHighLevel authorization was cancelled.",
  oauth_invalid: "The connection attempt was invalid. Start again from this page.",
  oauth_expired: "The connection attempt expired. Start again from this page.",
  oauth_no_location: "GoHighLevel did not return a location to link.",
  oauth_failed: "The GoHighLevel connection could not be completed.",
};

export default async function AdvancedIntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ ghl_error?: string; connected?: string; select_location?: string }>;
}) {
  const ctx = await requireOrgSettingsManager();
  const access = await loadAdvancedAccess(ctx);
  const params = await searchParams;
  if (params.select_location === "1" || params.connected === "1" || params.ghl_error) {
    const q = new URLSearchParams();
    if (params.select_location) q.set("select_location", params.select_location);
    if (params.connected) q.set("connected", params.connected);
    if (params.ghl_error) q.set("ghl_error", params.ghl_error);
    redirect(`/app/settings/workspace?${q.toString()}`);
  }

  const admin = getSupabaseAdmin();
  const supabase = await createClient();

  const [connection, health, maps, transcriptHealth, unmatched, followUpHealth, orgRow, baselineRun, selfReported, team, smsOrg] =
    await Promise.all([
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
      supabase.from("organizations").select("activated_at, sms_emergencies_enabled").eq("id", ctx.org.id).maybeSingle(),
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
      supabase
        .from("notification_team_channels")
        .select("slack_webhook_encrypted, teams_webhook_encrypted")
        .eq("org_id", ctx.org.id)
        .maybeSingle(),
      supabase.from("organizations").select("sms_emergencies_enabled").eq("id", ctx.org.id).maybeSingle(),
    ]);

  const { data: assignable } = await supabase
    .from("calls")
    .select("id, type, scheduled_at, occurred_at, lead_id")
    .eq("org_id", ctx.org.id)
    .is("raw_transcript", null)
    .order("scheduled_at", { ascending: false })
    .limit(50);

  const leadIds = [...new Set((assignable ?? []).map((row) => row.lead_id))];
  const { data: leadNames } =
    leadIds.length > 0
      ? await supabase.from("leads").select("id, first_name, last_name, email").eq("org_id", ctx.org.id).in("id", leadIds)
      : { data: [] };
  const nameByLead = new Map(
    (leadNames ?? []).map((lead) => [
      lead.id,
      [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.email || "Unnamed lead",
    ])
  );

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

  const { data: previewLead } = await supabase
    .from("leads")
    .select("id, first_name, last_name, email, ghl_contact_id, application_answers")
    .eq("org_id", ctx.org.id)
    .not("ghl_contact_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <PageFrame title="Integration detail" description="Health, field mapping from the live system, retries, and a live connection test.">
      <div className="space-y-8">
        <TestConnectionForm />
        <MappingRecordPreview
          leadName={
            previewLead
              ? [previewLead.first_name, previewLead.last_name].filter(Boolean).join(" ") ||
                previewLead.email ||
                "Unnamed lead"
              : null
          }
          contactId={previewLead?.ghl_contact_id ?? null}
        />
        <AdvancedWriteLock locked={!access.writable}>
        <IntegrationSettings
          oauthConfigured={ghlOAuthConfigured()}
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
          flash={null}
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
          assignableCalls={(assignable ?? []).map((row) => ({
            id: row.id,
            label: `${nameByLead.get(row.lead_id) ?? "Lead"} · ${row.type}`,
          }))}
          followUpHealth={followUpHealth}
        />
        <section>
          <SectionHeader
            title="Workspace alert channels"
            hint="Slack, Teams, and emergency SMS. These fire for stalled ingestion and a broken CRM."
          />
          <OrgAlertChannelsForm
            smsEmergenciesEnabled={smsOrg.data?.sms_emergencies_enabled ?? orgRow.data?.sms_emergencies_enabled ?? false}
            slackSaved={Boolean(team.data?.slack_webhook_encrypted)}
            teamsSaved={Boolean(team.data?.teams_webhook_encrypted)}
          />
        </section>
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
        </AdvancedWriteLock>
      </div>
    </PageFrame>
  );
}
