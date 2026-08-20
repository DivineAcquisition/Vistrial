import { TablePageSkeleton } from "@/components/app/page-skeletons";

export default function CallsLoading() {
  return (
    <TablePageSkeleton
      title="Calls"
      description="Recorded conversations and transcripts, once call capture is connected."
    />
  );
}
