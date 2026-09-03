import { ListPageSkeleton } from "@/components/app/page-skeletons";

export default function QueueLoading() {
  return (
    <ListPageSkeleton
      title="To call"
      description="People waiting to be contacted, in order."
    />
  );
}
