import { DataTable } from "@/components/ui/data-table";
import { SectionHeader } from "@/components/ui/section-header";

const columns = [
  { key: "period", label: "Period" },
  { key: "client", label: "Client" },
  { key: "appointments", label: "Appointments", align: "right" as const },
  { key: "total", label: "Total", align: "right" as const },
  { key: "status", label: "Status" },
];

export default function BillingPage() {
  return (
    <>
      <SectionHeader title="BILLING" />
      <DataTable columns={columns} rows={[]} empty="No charges yet." />
    </>
  );
}
