import { ListPageSkeleton } from "@/components/app/page-skeletons";

export default function QueueLoading() {
  return (
    <ListPageSkeleton
      title="Queue"
      description="Leads ready to work, once the CRM is connected and scoring is running."
    />
  );
}
