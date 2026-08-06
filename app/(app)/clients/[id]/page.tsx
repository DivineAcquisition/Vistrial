import { headers } from "next/headers";
import { notFound } from "next/navigation";

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
import { requireUser } from "@/lib/auth";
import { listDefinitions } from "@/lib/db/appointment-definitions";
import { getClient } from "@/lib/db/clients";
import { formatMoney } from "@/lib/format";
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

  const [definitions, origin] = await Promise.all([
    listDefinitions(client.id),
    baseUrl(),
  ]);

  const webhookUrl = `${origin}/api/webhooks/leads/${client.id}`;

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
                title="Lead ingestion"
                hint="Configure these in GoHighLevel when ingestion goes live."
              />
              <Panel className="px-5 py-2">
                <DefinitionList>
                  <KeyValue label="Webhook URL">
                    <CopyableValue value={webhookUrl} label="Webhook URL" />
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
        appointments={<EmptyState title="Arrives with lead ingestion." />}
        billing={<EmptyState title="Arrives with the billing engine." />}
      />
    </>
  );
}
