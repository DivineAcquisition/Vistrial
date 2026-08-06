import Link from "next/link";

import {
  AppointmentFilters,
  type AppointmentFilterValues,
} from "@/components/appointments/appointment-filters";
import { AppointmentsTable } from "@/components/appointments/appointments-table";
import { RecordAppointmentDialog } from "@/components/appointments/record-appointment-dialog";
import { toAppointmentRow } from "@/components/appointments/types";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { TonePill } from "@/components/ui/tone";
import { requireAdmin } from "@/lib/auth";
import {
  listAppointments,
  listLeadOptions,
  summarise,
  type AppointmentFilters as Filters,
  type AppointmentView,
} from "@/lib/db/appointments";
import { listClients } from "@/lib/db/clients";
import { formatMoney } from "@/lib/format";
import { APPOINTMENT_STATUSES } from "@/lib/appointments/status";
import { btnPrimary, btnSecondary, btnSizeSm } from "@/lib/ui";
import type { AppointmentStatus } from "@/types/database";

export const dynamic = "force-dynamic";

const STATUSES = new Set<string>(APPOINTMENT_STATUSES);

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const params = await searchParams;

  const values: AppointmentFilterValues = {
    client: single(params.client),
    status: single(params.status),
    from: single(params.from),
    to: single(params.to),
    version: single(params.version),
  };

  const version = Number.parseInt(values.version, 10);

  const filters: Filters = {
    ...(values.client ? { clientId: values.client } : {}),
    ...(STATUSES.has(values.status)
      ? { statuses: [values.status as AppointmentStatus] }
      : {}),
    ...(values.from ? { from: values.from } : {}),
    ...(values.to ? { to: values.to } : {}),
    ...(Number.isFinite(version) ? { definitionVersion: version } : {}),
  };

  let appointments: AppointmentView[];
  let clients: { id: string; name: string }[];
  let leads: Awaited<ReturnType<typeof listLeadOptions>>;

  try {
    [appointments, clients, leads] = await Promise.all([
      listAppointments(filters),
      listClients(),
      listLeadOptions(),
    ]);
  } catch {
    return (
      <>
        <PageHeader eyebrow="Ledger" title="Appointments" />
        <Panel className="px-5 py-4">
          <TonePill tone="warning">Supabase not connected</TonePill>
          <p className="mt-3 text-sm leading-relaxed text-silver">
            Check .env.local and apply the migrations in supabase/migrations.
          </p>
        </Panel>
      </>
    );
  }

  const metrics = summarise(appointments);
  const rows = appointments.map(toAppointmentRow);
  const versions = [...new Set(rows.map((row) => row.definitionVersion))].sort(
    (a, b) => b - a
  );

  return (
    <>
      <PageHeader
        eyebrow="Ledger"
        title="Appointments"
        description="Every appointment is the proof, the invoice line, and the analytics row. It is judged against the definition version stamped on it at creation, and nothing is billable until its review window has genuinely elapsed."
        actions={
          <>
            <Link href="/queue" className={`${btnSecondary} ${btnSizeSm}`}>
              Confirmation queue
            </Link>
            <RecordAppointmentDialog
              clients={clients}
              leads={leads}
              trigger={
                <button type="button" className={`${btnPrimary} ${btnSizeSm}`}>
                  Record an appointment
                </button>
              }
            />
          </>
        }
      />

      <KpiGrid>
        <KpiCard
          label="Pending review"
          value={String(metrics.pending)}
          tone="warning"
          sub={
            metrics.awaitingOutcome > 0
              ? `${metrics.awaitingOutcome} awaiting a show outcome`
              : "Waiting to be judged against the definition"
          }
        />
        <KpiCard
          label="Confirmed this cycle"
          value={String(metrics.confirmedThisCycle)}
          tone="good"
          sub="Confirmed and not yet assembled into a charge"
        />
        <KpiCard
          label="Disputed"
          value={String(metrics.disputed)}
          tone="critical"
          sub="Billing is held while these are open"
        />
        <KpiCard
          label="Cycle value"
          value={formatMoney(metrics.cycleValue)}
          tone="brand"
          sub="At the rate stamped on each confirmation"
        />
      </KpiGrid>

      <div className="mt-8">
        <AppointmentFilters clients={clients} versions={versions} values={values} />

        <SectionHeader
          title="Appointment log"
          hint={`Newest first. ${rows.length} shown.`}
        />

        {rows.length === 0 ? (
          <EmptyState
            title="No appointments match this view."
            detail="Appointments appear the moment a booking arrives on the inbound webhook or an admin records one by hand. Nothing is seeded and nothing is sampled."
          />
        ) : (
          <AppointmentsTable rows={rows} />
        )}
      </div>
    </>
  );
}
