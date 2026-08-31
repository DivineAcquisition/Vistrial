import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { IntegrationHub } from "@/components/integrations/integration-hub";
import { LocationPicker } from "@/components/integrations/location-picker";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { LOCATION_CLAIMED_MESSAGE } from "@/lib/ghl/constants";
import { listSessionLocations } from "@/lib/ghl/connect";
import { ghlOAuthConfigured } from "@/lib/ghl/env";
import { loadOrgIngestionHealth } from "@/lib/ghl/health";
import { buildHubCards, hubSummaryLine } from "@/lib/integrations/hub";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { helperClass } from "@/lib/ui";

const FLASH_ERRORS: Record<string, string> = {
  location_claimed: LOCATION_CLAIMED_MESSAGE,
  oauth_denied: "The GoHighLevel authorization was cancelled.",
  oauth_invalid: "The connection attempt was invalid. Start again from this page.",
  oauth_expired: "The connection attempt expired. Start again from this page.",
  oauth_no_location: "GoHighLevel did not return a location to link.",
  oauth_failed: "The GoHighLevel connection could not be completed.",
};

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    ghl_error?: string;
    connected?: string;
    select_location?: string;
    unverified?: string;
  }>;
}) {
  const ctx = await requireOrgSettingsManager();
  const params = await searchParams;
  const admin = getSupabaseAdmin();
  const supabase = await createClient();

  const [connection, health] = await Promise.all([
    supabase
      .from("ghl_connections")
      .select("status, location_name, last_verified_at")
      .eq("org_id", ctx.org.id)
      .maybeSingle(),
    loadOrgIngestionHealth(admin, ctx.org.id),
  ]);

  const selectLocation = params.select_location === "1";
  const locations = selectLocation ? await listSessionLocations(admin, ctx.org.id, ctx.member.id) : [];

  const cards = buildHubCards({
    status: connection.data?.status ?? health.connectionStatus,
    locationName: connection.data?.location_name ?? health.locationName,
    lastVerifiedAt: connection.data?.last_verified_at ?? health.lastVerifiedAt,
    oauthConfigured: ghlOAuthConfigured(),
  });

  return (
    <PageFrame
      title="Integrations"
      description="Connect GoHighLevel. Airtable is next."
      status={hubSummaryLine(cards)}
      actions={
        ctx.isPlatformAdmin ? (
          <Button variant="secondary" size="sm" render={<Link href="/app/settings/integrations/advanced" />}>
            Diagnostics
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {selectLocation ? <LocationPicker locations={locations} /> : null}

        {health.lastSetupError ? (
          <Notice tone="warning" title="New leads are not arriving">
            The location is linked, but new leads are not coming through. Reconnect below.
          </Notice>
        ) : null}

        <IntegrationHub
          cards={cards}
          now={new Date().toISOString()}
          flash={
            params.connected === "1" && params.unverified !== "1"
              ? "Connected and working. We just read your account back to check."
              : null
          }
          flashError={
            params.unverified === "1"
              ? "Connected, but we could not read your account back yet. Press Reconnect if leads do not start arriving within the hour."
              : params.ghl_error
                ? FLASH_ERRORS[params.ghl_error] ?? FLASH_ERRORS.oauth_failed
                : null
          }
        />

        {ctx.isPlatformAdmin ? (
          <p className={helperClass}>
            Field mapping, connection health, call recorders, and history import live under
            Diagnostics.
          </p>
        ) : null}
      </div>
    </PageFrame>
  );
}
