import { DataTable } from "@/components/ui/data-table";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { requireUser } from "@/lib/auth";

const columns = [
  { key: "date", label: "Date" },
  { key: "client", label: "Client" },
  { key: "lead", label: "Lead" },
  { key: "status", label: "Status" },
  { key: "rate", label: "Rate", align: "right" as const },
];

export default async function AppointmentsPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        eyebrow="Ledger"
        title="Appointments"
        description="Every appointment is the proof, the invoice line, and the analytics row. Nothing is billable until it is confirmed."
      />

      <KpiGrid>
        <KpiCard label="Pending review" value="—" tone="warning" />
        <KpiCard label="Confirmed this cycle" value="—" tone="good" />
        <KpiCard label="Disputed" value="—" tone="critical" />
        <KpiCard label="Cycle total" value="—" tone="brand" />
      </KpiGrid>

      <div className="mt-8">
        <SectionHeader title="Appointment log" hint="Newest first." />
        <DataTable columns={columns} rows={[]} empty="No appointments yet." />
      </div>
    </>
  );
}
