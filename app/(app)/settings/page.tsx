import { DigestSettings } from "@/components/settings/digest-settings";
import { InboundTestTool } from "@/components/settings/inbound-test-tool";
import {
  UnresolvedEvents,
  type UnresolvedEventView,
} from "@/components/settings/unresolved-events";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { TonePill } from "@/components/ui/tone";
import { DEFAULT_DIGEST_HOUR, getDigestHour } from "@/lib/attention/digest";
import { requireAdmin } from "@/lib/auth";
import { listClients } from "@/lib/db/clients";
import { listUnresolvedEvents, STATUS_LABELS } from "@/lib/db/inbound-events";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();

  let clients: { id: string; name: string }[];
  let events: UnresolvedEventView[];
  let digestHour = DEFAULT_DIGEST_HOUR;

  try {
    const [clientRows, eventRows] = await Promise.all([
      listClients(),
      listUnresolvedEvents(),
    ]);

    clients = clientRows.map((client) => ({ id: client.id, name: client.name }));
    events = eventRows.map((event) => ({
      id: event.id,
      receivedAt: event.received_at,
      declaredType: event.event_type,
      status: event.status,
      statusLabel: STATUS_LABELS[event.status],
      clientName: event.client?.name ?? null,
      note: event.error,
      payload: JSON.stringify(event.payload, null, 2),
    }));

    try {
      digestHour = await getDigestHour(createServiceClient());
    } catch {
      // Migration 010 may not be applied yet; the default hour still renders.
      digestHour = DEFAULT_DIGEST_HOUR;
    }
  } catch {
    return (
      <>
        <PageHeader eyebrow="Ledger" title="Settings" />
        <Panel className="px-5 py-4">
          <TonePill tone="warning">Supabase not connected</TonePill>
          <p className="mt-3 text-sm leading-relaxed text-silver">
            Check .env.local and apply the migrations in supabase/migrations.
          </p>
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Ledger"
        title="Settings"
        description="Inbound plumbing lives here: what arrived that nobody could place, and a way to exercise the endpoint before a provider is connected."
      />

      <section className="mb-10">
        <SectionHeader
          title="Inbound endpoint"
          hint="One endpoint receives everything. The secret identifies the client."
        />
        <Panel className="px-5 py-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-semibold tracking-[0.12em] text-dim uppercase">
                URL
              </dt>
              <dd className="mt-1 font-mono text-sm text-silver">
                POST /api/webhooks/inbound
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold tracking-[0.12em] text-dim uppercase">
                Secret header
              </dt>
              <dd className="mt-1 font-mono text-sm text-silver">
                x-vistrial-secret
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm leading-relaxed text-dim">
            A request with a missing or unmatched secret is rejected before its
            body is parsed. Every authenticated request is written to the inbound
            events table before anything is interpreted, so an unparseable payload
            is still evidence.
          </p>
        </Panel>
      </section>

      <section id="inbound-events" className="mb-10 scroll-mt-24">
        <SectionHeader
          title="Unattributed and unknown events"
          hint="Nothing here was discarded. A rising count means a workflow was added without a handler, or a secret is misconfigured."
          actions={
            events.length > 0 ? (
              <TonePill tone="critical">{events.length} waiting</TonePill>
            ) : (
              <TonePill tone="good">Clear</TonePill>
            )
          }
        />
        <UnresolvedEvents events={events} clients={clients} />
      </section>

      <section className="mb-10">
        <SectionHeader
          title="Daily attention digest"
          hint="One email each morning when something is outstanding. An empty morning sends nothing."
        />
        <Panel className="px-5 py-4">
          <DigestSettings hour={digestHour} />
        </Panel>
      </section>

      <section>
        <SectionHeader
          title="Inbound test tool"
          hint="A development and configuration tool. It posts to the real endpoint with the client's real secret and gets no special treatment."
        />
        <InboundTestTool clients={clients} />
      </section>
    </>
  );
}
