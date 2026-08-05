import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";

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
      <PageHeader
        eyebrow="Ledger"
        title="Appointments"
        description="Every appointment is the proof, the invoice line, and the analytics row. Nothing is billable until it is confirmed."
      />

      <StatGrid>
        <StatTile label="Pending review" value="—" tone="warning" />
        <StatTile label="Confirmed this cycle" value="—" tone="good" />
        <StatTile label="Disputed" value="—" tone="critical" />
        <StatTile label="Cycle total" value="—" tone="brand" />
      </StatGrid>

      <div className="mt-8">
        <SectionHeader title="Appointment log" hint="Newest first." />
        <DataTable columns={columns} rows={[]} empty="No appointments yet." />
      </div>
    </>
  );
}
