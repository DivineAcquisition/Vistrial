import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { requireUser } from "@/lib/auth";

const columns = [
  { key: "arrived", label: "Arrived" },
  { key: "client", label: "Client" },
  { key: "name", label: "Name" },
  { key: "source", label: "Source" },
  { key: "response", label: "Response", align: "right" as const },
];

export default async function LeadsPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        eyebrow="Ledger"
        title="Leads"
        description="Response time is derived from touches, which are stamped once and never overwritten."
      />

      <SectionHeader title="Inbound leads" hint="Newest first." />
      <DataTable columns={columns} rows={[]} empty="No leads yet." />
    </>
  );
}
