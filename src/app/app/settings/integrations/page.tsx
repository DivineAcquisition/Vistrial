import { PageFrame } from "@/components/app/page-frame";
import { IntegrationSettings } from "@/app/app/settings/integrations/integration-settings";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { LOCATION_CLAIMED_MESSAGE } from "@/lib/ghl/constants";
import { fetchCustomFields } from "@/lib/ghl/client";
import { listSessionLocations } from "@/lib/ghl/connect";
import { appUrl, ghlOAuthConfigured } from "@/lib/ghl/env";
import { loadFollowUpHealth } from "@/lib/follow-up/health";
import { loadOrgIngestionHealth } from "@/lib/ghl/health";
import { loadOpenUnmatched, loadTranscriptHealth } from "@/lib/transcripts/health";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const FLASH_ERRORS: Record<string, string> = {
  location_claimed: LOCATION_CLAIMED_MESSAGE,
  oauth_denied: "The GoHighLevel authorization was cancelled.",
  oauth_invalid: "The connection attempt was invalid. Start again from this page.",
  oauth_expired: "The connection attempt expired. Start again from this page.",
  oauth_no_location: "GoHighLevel did not return a location to link.",
  oauth_failed: "The GoHighLevel connection could not be completed.",
};

export default async function IntegrationsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ghl_error?: string; connected?: string; select_location?: string }>;
}) {
  const ctx = await requireOrgSettingsManager();
  const params = await searchParams;
  const admin = getSupabaseAdmin();
  const supabase = await createClient();

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

  return (
    <PageFrame
      title="Integrations"
      description="The CRM connection for this workspace."
    >
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
        assignableCalls={(assignable ?? []).map((row) => ({
          id: row.id,
          label: `${nameByLead.get(row.lead_id) ?? "Lead"} · ${row.type}`,
        }))}
        followUpHealth={followUpHealth}
      />
    </PageFrame>
  );
}
