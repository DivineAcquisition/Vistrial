import { DataTable } from "@/components/ui/data-table";
import { KpiCard } from "@/components/ui/kpi-card";
import { SectionHeader } from "@/components/ui/section-header";

const columns = [
  { key: "date", label: "Date" },
  { key: "client", label: "Client" },
  { key: "lead", label: "Lead" },
  { key: "status", label: "Status" },
  { key: "rate", label: "Rate", align: "right" as const },
];

export default function AppointmentsPage() {
  return (
    <>
      <SectionHeader title="APPOINTMENTS" />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Pending Review" value="—" tone="warn" />
        <KpiCard label="Confirmed This Cycle" value="—" tone="pos" />
        <KpiCard label="Disputed" value="—" tone="neg" />
        <KpiCard label="Cycle Total" value="—" tone="primary" />
      </div>

      <DataTable columns={columns} rows={[]} empty="No appointments yet." />
    </>
  );
}
