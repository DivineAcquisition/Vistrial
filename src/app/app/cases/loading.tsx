import { TablePageSkeleton } from "@/components/app/page-skeletons";

export default function CasesLoading() {
  return (
    <TablePageSkeleton
      title="Case Files"
      description="Every lead in this workspace — the full record, not just who needs action now."
    />
  );
}
