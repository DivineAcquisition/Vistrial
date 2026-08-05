import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
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
      <PageHeader
        eyebrow="Ledger"
        title="Billing"
        description="One charge per client per cycle, rolled up from confirmed appointments and adjusted for the monthly minimum."
      />

      <SectionHeader title="Charges" hint="Newest cycle first." />
      <DataTable columns={columns} rows={[]} empty="No charges yet." />
    </>
  );
}
