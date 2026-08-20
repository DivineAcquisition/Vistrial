import { PageFrame } from "@/components/app/page-frame";
import { IntegrationSettings } from "@/app/app/settings/integrations/integration-settings";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { LOCATION_CLAIMED_MESSAGE } from "@/lib/ghl/constants";
import { fetchCustomFields } from "@/lib/ghl/client";
import { listSessionLocations } from "@/lib/ghl/connect";
import { ghlOAuthConfigured } from "@/lib/ghl/env";
import { loadOrgIngestionHealth } from "@/lib/ghl/health";
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

  const [connection, health, maps] = await Promise.all([
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
        }}
        health={{
          receivedLast24h: health.receivedLast24h,
          unprocessed: health.unprocessed,
          oldestUnprocessedAgeMs: health.oldestUnprocessedAgeMs,
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
      />
    </PageFrame>
  );
}
