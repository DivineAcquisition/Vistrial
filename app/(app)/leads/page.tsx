import { DataTable } from "@/components/ui/data-table";
import { SectionHeader } from "@/components/ui/section-header";

const columns = [
  { key: "arrived", label: "Arrived" },
  { key: "client", label: "Client" },
  { key: "name", label: "Name" },
  { key: "source", label: "Source" },
  { key: "response", label: "Response", align: "right" as const },
];

export default function LeadsPage() {
  return (
    <>
      <SectionHeader title="LEADS" />
      <DataTable columns={columns} rows={[]} empty="No leads yet." />
    </>
  );
}
