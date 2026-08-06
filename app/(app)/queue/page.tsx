import { QueueList } from "@/components/appointments/queue-list";
import { toAppointmentRow } from "@/components/appointments/types";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { TonePill } from "@/components/ui/tone";
import { requireUser } from "@/lib/auth";
import { listQueue, type AppointmentView } from "@/lib/db/appointments";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  await requireUser();

  let queue: AppointmentView[];
  try {
    queue = await listQueue();
  } catch {
    return (
      <>
        <PageHeader eyebrow="Ledger" title="Confirmation queue" />
        <Panel className="px-5 py-4">
          <TonePill tone="warning">Supabase not connected</TonePill>
          <p className="mt-3 text-sm leading-relaxed text-silver">
            Check .env.local and apply the migrations in supabase/migrations.
          </p>
        </Panel>
      </>
    );
  }

  const rows = queue.map(toAppointmentRow);
  const disputed = rows.filter((row) => row.status === "disputed").length;
  const awaitingOutcome = rows.filter((row) => row.awaitingOutcome).length;
  const reviewable = rows.length - disputed - awaitingOutcome;

  return (
    <>
      <PageHeader
        eyebrow="Ledger"
        title="Confirmation queue"
        description="The governing definition is shown in full beside every appointment, so the criteria are read at the moment of the decision rather than remembered."
      />

      <KpiGrid columns={3}>
        <KpiCard
          label="Awaiting review"
          value={String(reviewable)}
          tone="warning"
          sub="Oldest first"
        />
        <KpiCard
          label="Disputed"
          value={String(disputed)}
          tone="critical"
          sub="Billing held until settled"
        />
        <KpiCard
          label="Awaiting an outcome"
          value={String(awaitingOutcome)}
          tone="neutral"
          sub="Bills on showed, no outcome reported"
        />
      </KpiGrid>

      <div className="mt-8">
        <QueueList rows={rows} />
      </div>
    </>
  );
}
