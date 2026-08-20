import { TablePageSkeleton } from "@/components/app/page-skeletons";

export default function CasesLoading() {
  return (
    <TablePageSkeleton
      title="Case Files"
      description="Every lead's persistent record, once contacts sync from the CRM."
    />
  );
}
