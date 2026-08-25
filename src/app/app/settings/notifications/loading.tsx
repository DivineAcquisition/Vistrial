import { PageFrame } from "@/components/app/page-frame";
import { Skeleton } from "@/components/ui/skeleton";

export default function NotificationsLoading() {
  return (
    <PageFrame title="Notifications">
      <Skeleton className="h-48 max-w-xl" />
    </PageFrame>
  );
}
