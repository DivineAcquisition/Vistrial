import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { AppointmentsTable } from "@/components/appointments/appointments-table";
import { toAppointmentRow } from "@/components/appointments/types";
import { ClientDialog } from "@/components/clients/client-dialog";
import { ClientStatusBadge } from "@/components/clients/client-status-badge";
import { ClientTabs } from "@/components/clients/client-tabs";
import { DefinitionHistory } from "@/components/clients/definition-history";
import {
  CopyableValue,
  WebhookSecretField,
} from "@/components/clients/webhook-config";
import { DefinitionList, KeyValue } from "@/components/ui/definition-list";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { TonePill } from "@/components/ui/tone";
import { requireUser } from "@/lib/auth";
import { listDefinitions } from "@/lib/db/appointment-definitions";
import { listAppointments, showStats } from "@/lib/db/appointments";
import { getClient } from "@/lib/db/clients";
import { formatMoney, formatPercent } from "@/lib/format";
import { btnSecondary, btnSizeSm } from "@/lib/ui";

export const dynamic = "force-dynamic";

async function baseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ??
    headerList.get("host") ??
    "localhost:3000";
  const protocol =
    headerList.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");

  return `${protocol}://${host}`;
}

function Gap() {
  return <span className="text-dim">—</span>;
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();

  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  const [definitions, origin, appointments, shows] = await Promise.all([
    listDefinitions(client.id),
    baseUrl(),
    listAppointments({ clientId: client.id }),
    showStats(client.id),
  ]);

  const reported = shows.showed + shows.notShown;
  const notShownRate = reported === 0 ? null : shows.notShown / reported;

  // One endpoint receives everything. The secret in the header is what
  // identifies the client, so the URL carries no id of its own.
  const webhookUrl = `${origin}/api/webhooks/inbound`;

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
        billing={<EmptyState title="Arrives with the billing engine." />}
      />
    </>
  );
}
