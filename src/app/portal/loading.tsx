import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";

export default function PortalLoading() {
  return (
    <PageFrame title="Report" description="Loading this report.">
      <span role="status" className="sr-only">
        Loading report
      </span>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
      <Panel className="mt-8 p-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-4 h-24 w-full" />
      </Panel>
    </PageFrame>
  );
}
