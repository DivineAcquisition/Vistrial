import Link from "next/link";

import { LeadFilters, type LeadFilterValues } from "@/components/leads/lead-filters";
import { LeadsTable } from "@/components/leads/leads-table";
import type { LeadRowData } from "@/components/leads/types";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { TonePill } from "@/components/ui/tone";
import { requireUser } from "@/lib/auth";
import { listClients } from "@/lib/db/clients";
import { countUnresolvedEvents } from "@/lib/db/inbound-events";
import { listLeads, type LeadFilters as Filters, type LeadWithResponse } from "@/lib/db/leads";
import { averageMs, formatResponse, responseTone } from "@/lib/response-time";
import type { LeadSource } from "@/types/database";

export const dynamic = "force-dynamic";

const SOURCES = new Set<string>(["Paid", "Direct", "Referral", "Organic", "Other"]);

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function toRow(lead: LeadWithResponse): LeadRowData {
  const appointment = lead.appointments[0] ?? null;

  return {
    id: lead.id,
    arrivedAt: lead.arrived_at,
    arrivalSource: lead.arrival_source,
    clientName: lead.client?.name ?? "Unattributed",
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    source: lead.source,
    campaignName: lead.campaign?.name ?? null,
    jobType: lead.job_type,
    systemMs: lead.response.systemMs,
    humanMs: lead.response.humanMs,
    gapMs: lead.response.gapMs,
    appointment: appointment
      ? {
          id: appointment.id,
          status: appointment.status,
          scheduledFor: appointment.scheduled_for,
        }
      : null,
    touches: lead.touches.map((touch) => ({
      id: touch.id,
      type: touch.touch_type,
      channel: touch.channel,
      occurredAt: touch.occurred_at,
      isFirstOfType: touch.is_first_of_type,
    })),
    submissions: [...lead.submissions]
      .sort((a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at))
      .map((submission) => ({
        id: submission.id,
        submittedAt: submission.submitted_at,
        isOriginal: submission.is_original,
      })),
    payload: JSON.stringify(lead.raw_payload, null, 2),
  };
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();

  const params = await searchParams;

  const values: LeadFilterValues = {
    client: single(params.client),
    source: single(params.source),
    from: single(params.from),
    to: single(params.to),
    awaiting: single(params.awaiting) === "1",
  };

  const filters: Filters = {
    ...(values.client ? { clientId: values.client } : {}),
    ...(SOURCES.has(values.source) ? { source: values.source as LeadSource } : {}),
    ...(values.from ? { from: values.from } : {}),
    ...(values.to ? { to: values.to } : {}),
    ...(values.awaiting ? { awaitingHuman: true } : {}),
  };

  let leads: LeadWithResponse[];
  let clients: { id: string; name: string }[];
  try {
    [leads, clients] = await Promise.all([listLeads(filters), listClients()]);
  } catch {
    return (
      <>
        <PageHeader eyebrow="Ledger" title="Leads" />
        <Panel className="px-5 py-4">
          <TonePill tone="warning">Supabase not connected</TonePill>
          <p className="mt-3 text-sm leading-relaxed text-silver">
            Check .env.local and apply the migrations in supabase/migrations.
          </p>
        </Panel>
      </>
    );
  }

  const unresolved = await countUnresolvedEvents();

  const today = new Date().toISOString().slice(0, 10);
  const leadsToday = leads.filter((lead) => lead.arrived_at.slice(0, 10) === today).length;
  const awaitingHuman = leads.filter((lead) => lead.response.humanMs === null).length;
  const averageSystem = averageMs(leads.map((lead) => lead.response.systemMs));
  const averageHuman = averageMs(leads.map((lead) => lead.response.humanMs));

  return (
    <>
      <PageHeader
        eyebrow="Ledger"
        title="Leads"
        description="Response time is derived from touches, which are stamped once and never overwritten. Raw clock time, with no business-hours adjustment."
      />

      {unresolved > 0 ? (
        <Link
          href="/settings#inbound-events"
          className="panel panel-hover mb-6 flex flex-wrap items-center gap-3 rounded-2xl px-5 py-4"
        >
          <TonePill tone="critical">{unresolved} unresolved</TonePill>
          <span className="text-sm text-silver">
            Inbound events could not be attributed or recognised.
          </span>
          <span className="ml-auto text-xs text-dim">
            Review them in settings
          </span>
        </Link>
      ) : null}

      <KpiGrid>
        <KpiCard
          label="Leads today"
          value={String(leadsToday)}
          tone="brand"
          sub="Arrived since midnight UTC"
        />
        <KpiCard
          label="Average system response"
          value={formatResponse(averageSystem)}
          tone={responseTone(averageSystem)}
          sub="Leads still awaiting are excluded, not counted as zero"
        />
        <KpiCard
          label="Average human response"
          value={formatResponse(averageHuman)}
          tone={responseTone(averageHuman)}
          sub="Leads still awaiting are excluded, not counted as zero"
        />
        <KpiCard
          label="Awaiting a human"
          value={String(awaitingHuman)}
          tone="critical"
          sub="The figure worth looking at every morning"
        />
      </KpiGrid>

      <div className="mt-8">
        <LeadFilters clients={clients} values={values} />

        <SectionHeader
          title="Inbound leads"
          hint={`Newest first. ${leads.length} shown.`}
        />

        {leads.length === 0 ? (
          <EmptyState
            title="No leads match this view."
            detail="Leads appear here the moment a provider posts to the inbound webhook. Nothing is seeded and nothing is sampled — an empty table means nothing has arrived."
          />
        ) : (
          <LeadsTable rows={leads.map(toRow)} />
        )}
      </div>
    </>
  );
}
