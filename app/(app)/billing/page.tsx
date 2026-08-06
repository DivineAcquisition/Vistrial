import { RunCycleJobButton } from "@/components/billing/actions";
import { AttentionList } from "@/components/billing/attention-list";
import {
  ChargeFilters,
  type ChargeFilterValues,
} from "@/components/billing/charge-filters";
import { ChargesTable } from "@/components/billing/charges-table";
import { JobLog } from "@/components/billing/job-log";
import { toChargeRow } from "@/components/billing/types";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { TonePill } from "@/components/ui/tone";
import { requireUser } from "@/lib/auth";
import {
  attentionItems,
  billingMetrics,
  listCharges,
  listJobRuns,
  type ChargeFilters as Filters,
} from "@/lib/db/billing";
import { listClients } from "@/lib/db/clients";
import { formatMoney } from "@/lib/format";
import type { ChargeStatus } from "@/types/database";

export const dynamic = "force-dynamic";

const STATUSES = new Set<string>([
  "draft",
  "notified",
  "processing",
  "paid",
  "failed",
  "credited",
]);

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();

  const params = await searchParams;

  const values: ChargeFilterValues = {
    client: single(params.client),
    status: single(params.status),
    from: single(params.from),
    to: single(params.to),
  };

  const filters: Filters = {
    ...(values.client ? { clientId: values.client } : {}),
    ...(STATUSES.has(values.status) ? { status: values.status as ChargeStatus } : {}),
    ...(values.from ? { from: values.from } : {}),
    ...(values.to ? { to: values.to } : {}),
  };

  let charges: Awaited<ReturnType<typeof listCharges>>;
  let metrics: Awaited<ReturnType<typeof billingMetrics>>;
  let attention: Awaited<ReturnType<typeof attentionItems>>;
  let runs: Awaited<ReturnType<typeof listJobRuns>>;
  let clients: { id: string; name: string }[];

  try {
    [charges, metrics, attention, runs, clients] = await Promise.all([
      listCharges(filters),
      billingMetrics(),
      attentionItems(),
      listJobRuns(5),
      listClients(),
    ]);
  } catch {
    return (
      <>
        <PageHeader eyebrow="Ledger" title="Billing" />
        <Panel className="px-5 py-4">
          <TonePill tone="warning">Supabase not connected</TonePill>
          <p className="mt-3 text-sm leading-relaxed text-silver">
            Check .env.local and apply the migrations in supabase/migrations.
          </p>
        </Panel>
      </>
    );
  }

  const rows = charges.map(toChargeRow);

  return (
    <>
      <PageHeader
        eyebrow="Ledger"
        title="Billing"
        description="One charge per client per cycle, assembled from appointments whose review window has fully elapsed. Nothing processes until the client has been sent the itemisation it contains."
        actions={<RunCycleJobButton />}
      />

      <KpiGrid>
        <KpiCard
          label="Billed this month"
          value={formatMoney(metrics.billedThisMonth)}
          tone="brand"
          sub="Everything assembled since the first"
        />
        <KpiCard
          label="Collected this month"
          value={formatMoney(metrics.collectedThisMonth)}
          tone="good"
          sub="Payments that actually landed"
        />
        <KpiCard
          label="Outstanding"
          value={formatMoney(metrics.outstanding)}
          tone={metrics.outstanding > 0 ? "critical" : "neutral"}
          sub="Failed, holding, or not yet due"
        />
        <KpiCard
          label="Locked, not yet charged"
          value={formatMoney(metrics.lockedNotCharged)}
          tone="warning"
          sub={`${metrics.lockedCount} appointment${
            metrics.lockedCount === 1 ? "" : "s"
          } out of their window`}
        />
      </KpiGrid>

      <section className="mt-8">
        <SectionHeader
          title="Needs a person"
          hint="Loudest first, and louder the longer it has been true."
          actions={
            attention.length > 0 ? (
              <TonePill tone="critical">{attention.length} waiting</TonePill>
            ) : null
          }
        />
        <AttentionList items={attention} />
      </section>

      <section className="mt-10">
        <ChargeFilters clients={clients} values={values} />

        <SectionHeader title="Charges" hint={`Newest cycle first. ${rows.length} shown.`} />

        {rows.length === 0 ? (
          <EmptyState
            title="No charges match this view."
            detail="A charge appears when a client's cycle closes with appointments that have come out of their review window. Nothing is seeded and nothing is sampled."
          />
        ) : (
          <ChargesTable rows={rows} openId={single(params.charge) || undefined} />
        )}
      </section>

      <section className="mt-10">
        <SectionHeader
          title="Cycle job"
          hint="Every run is recorded, including the runs that had nothing to do."
        />
        <JobLog runs={runs} />
      </section>
    </>
  );
}
