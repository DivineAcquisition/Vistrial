import { PageFrame } from "@/components/app/page-frame";
import { Skeleton } from "@/components/ui/skeleton";
import { formMeasure } from "@/lib/ui";

export default function DataSettingsLoading() {
  return (
    <PageFrame title="Data">
      <Skeleton className={`h-48 ${formMeasure}`} />
    </PageFrame>
  );
}
