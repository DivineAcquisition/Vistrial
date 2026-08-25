import { PageFrame } from "@/components/app/page-frame";
import { Skeleton } from "@/components/ui/skeleton";

export default function DataSettingsLoading() {
  return (
    <PageFrame title="Data">
      <Skeleton className="h-48 max-w-xl" />
    </PageFrame>
  );
}
