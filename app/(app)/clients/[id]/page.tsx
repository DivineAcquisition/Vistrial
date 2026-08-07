import { notFound } from "next/navigation";

import { AppointmentsTable } from "@/components/appointments/appointments-table";
import { toAppointmentRow } from "@/components/appointments/types";
import { ClientBilling } from "@/components/billing/client-billing";
import { ClientDialog } from "@/components/clients/client-dialog";
import { ClientStatusBadge } from "@/components/clients/client-status-badge";
import { ClientTabs } from "@/components/clients/client-tabs";
import { DefinitionHistory } from "@/components/clients/definition-history";
import { ExclusivityPanel } from "@/components/clients/exclusivity-panel";
import { PortalPanel } from "@/components/clients/portal-panel";
import {
  CopyableValue,
  WebhookSecretField,
} from "@/components/clients/webhook-config";
import { CostHero } from "@/components/portal/cost-hero";
import { DefinitionList, KeyValue } from "@/components/ui/definition-list";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { TonePill } from "@/components/ui/tone";
import { requireAdmin } from "@/lib/auth";
import { listDefinitions } from "@/lib/db/appointment-definitions";
import { listAppointments, showStats } from "@/lib/db/appointments";
import { listAdSpend, listCampaigns } from "@/lib/db/ad-spend";
import { listCharges, listCredits, nextChargeFor } from "@/lib/db/billing";
import { getClient } from "@/lib/db/clients";
import {
  listClientUsers,
  listShareLinks,
  loadPortalDashboard,
} from "@/lib/db/portal";
import {
  countClientsSharingCategories,
  listClientCategoryIds,
  listOverridesForClient,
  listServiceCategories,
  listTerritories,
} from "@/lib/db/territory";
import { formatMoney, formatPercent } from "@/lib/format";
import { webhookBaseUrl } from "@/lib/settings/urls";
import { btnSecondary, btnSizeSm } from "@/lib/ui";

export const dynamic = "force-dynamic";

function Gap() {
  return <span className="text-dim">—</span>;
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  const [
    definitions,
    webhookOrigin,
    appointments,
    shows,
    charges,
    credits,
    next,
    portalUsers,
    shareLinks,
    spend,
    campaigns,
    portalDashboard,
    serviceCategories,
    clientCategoryIds,
    territories,
    overrides,
  ] = await Promise.all([
    listDefinitions(client.id),
    webhookBaseUrl(),
    listAppointments({ clientId: client.id }),
    showStats(client.id),
    listCharges({ clientId: client.id }),
    listCredits(client.id),
    nextChargeFor(client),
    listClientUsers(client.id),
    listShareLinks(client.id),
    listAdSpend(client.id),
    listCampaigns(client.id),
    loadPortalDashboard(client.id),
    listServiceCategories(),
    listClientCategoryIds(client.id),
    listTerritories(client.id),
    listOverridesForClient(client.id),
  ]);

  const peersSharingCategory = await countClientsSharingCategories(
    clientCategoryIds,
    client.id
  );

  const reported = shows.showed + shows.notShown;
  const notShownRate = reported === 0 ? null : shows.notShown / reported;

  // One endpoint receives everything on the Supabase project. The secret in
  // the header is what identifies the client, so the URL carries no id of its own.
  const webhookUrl = webhookOrigin;

  return (
    <>
      <PageHeader
        eyebrow="Client"
        title={client.name}
        actions={
          <div className="flex items-center gap-3">
            <ClientStatusBadge status={client.status} />
            <ClientDialog
              mode="edit"
              client={client}
              trigger={
                <button type="button" className={`${btnSecondary} ${btnSizeSm}`}>
                  Edit
                </button>
              }
            />
          </div>
        }
      />

      <KpiGrid>
        <KpiCard
          label="Rate per appointment"
          value={formatMoney(client.rate_per_appointment)}
          tone="brand"
          sub={`Billed on ${client.bill_on}`}
        />
        <KpiCard
          label="Monthly minimum"
          value={formatMoney(client.monthly_minimum)}
        />
        <KpiCard
          label="Billing cycle"
          value={`${client.billing_cycle_days} days`}
        />
        <KpiCard
          label="Review window"
          value={`${client.review_window_hours} hours`}
          sub="Client time to dispute"
        />
      </KpiGrid>

      {client.contact_email === null ? (
        <Panel className="mt-6 flex flex-wrap items-center gap-3 border-l-2 border-l-flag-critical px-5 py-4">
          <TonePill tone="critical">No contact email</TonePill>
          <p className="text-sm text-silver">
            Confirmations cannot be delivered, and a client can never be charged
            for an appointment they were never told about. Add one before this
            client&rsquo;s first cycle.
          </p>
        </Panel>
      ) : null}

      <ClientTabs
        overview={
          <div className="space-y-8">
            <div>
              <SectionHeader title="Contact" />
              <Panel className="px-5 py-2">
                <DefinitionList>
                  <KeyValue label="Contact name">
                    {client.contact_name ?? <Gap />}
                  </KeyValue>
                  <KeyValue label="Contact email">
                    {client.contact_email ?? <Gap />}
                  </KeyValue>
                  <KeyValue label="Contact phone">
                    {client.contact_phone ?? <Gap />}
                  </KeyValue>
                </DefinitionList>
              </Panel>
            </div>

            <div>
              <SectionHeader
                title="Inbound"
                hint="Leads, touches, bookings, and show outcomes all post here. The secret identifies the client."
              />
              <Panel className="px-5 py-2">
                <DefinitionList>
                  <KeyValue label="Webhook URL">
                    <CopyableValue value={webhookUrl} label="Webhook URL" />
                  </KeyValue>
                  <KeyValue label="Secret header">
                    <span className="font-mono text-sm">x-vistrial-secret</span>
                  </KeyValue>
                  <KeyValue label="Webhook secret">
                    <WebhookSecretField secret={client.webhook_secret} />
                  </KeyValue>
                  <KeyValue label="GoHighLevel location">
                    {client.ghl_location_id ? (
                      <CopyableValue
                        value={client.ghl_location_id}
                        label="Location ID"
                      />
                    ) : (
                      <Gap />
                    )}
                  </KeyValue>
                </DefinitionList>
              </Panel>
            </div>
          </div>
        }
        definition={
          <DefinitionHistory clientId={client.id} definitions={definitions} />
        }
        exclusivity={
          <ExclusivityPanel
            clientId={client.id}
            exclusivityStatus={client.exclusivity_status ?? "active"}
            categories={serviceCategories}
            selectedCategoryIds={clientCategoryIds}
            territories={territories}
            overrides={overrides}
            peersSharingCategory={peersSharingCategory}
            definitionServiceArea={
              definitions[0]?.service_area ?? client.service_area
            }
          />
        }
        appointments={
          <div className="space-y-8">
            <div>
              <SectionHeader
                title="Booked but not shown"
                hint="Tracked regardless of billing basis. It is the clearest signal of whether this client's own process is working."
              />
              <KpiGrid>
                <KpiCard
                  label="Appointments held"
                  value={String(shows.booked)}
                  sub="Confirmed, disputed, billed, or rejected"
                />
                <KpiCard label="Showed" value={String(shows.showed)} tone="good" />
                <KpiCard label="Did not show" value={String(shows.notShown)} tone="critical" />
                <KpiCard
                  label="No-show rate"
                  value={notShownRate === null ? "—" : formatPercent(notShownRate)}
                  tone={notShownRate === null ? "neutral" : "warning"}
                  sub={
                    shows.unreported > 0
                      ? `${shows.unreported} never reported on, excluded`
                      : "Of the outcomes reported"
                  }
                />
              </KpiGrid>
            </div>

            <div>
              <SectionHeader
                title="Appointments"
                hint={`Newest first. ${appointments.length} on record.`}
              />
              {appointments.length === 0 ? (
                <EmptyState
                  title="No appointments yet."
                  detail="They appear the moment a booking arrives on the inbound webhook or an admin records one by hand."
                />
              ) : (
                <AppointmentsTable rows={appointments.map(toAppointmentRow)} />
              )}
            </div>
          </div>
        }
        billing={
          <ClientBilling
            client={client}
            charges={charges}
            credits={credits}
            next={next}
          />
        }
        portal={
          <div className="space-y-8">
            <div>
              <SectionHeader
                title="Combined cost per appointment"
                hint="The same figure the client sees. Unavailable when any day in the period has no spend row."
              />
              <CostHero cost={portalDashboard.cost} />
            </div>
            <PortalPanel
              clientId={client.id}
              users={portalUsers}
              links={shareLinks}
              spend={spend}
              campaigns={campaigns}
            />
          </div>
        }
      />
    </>
  );
}
