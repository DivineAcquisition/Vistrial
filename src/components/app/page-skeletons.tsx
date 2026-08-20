import { PageFrame } from "@/components/app/page-frame";
import { Skeleton } from "@/components/ui/skeleton";

export function ListPageSkeleton({
  title = "Loading",
  description = "Fetching this section.",
  rows = 6,
}: {
  title?: string;
  description?: string;
  rows?: number;
}) {
  return (
    <PageFrame title={title} description={description}>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full rounded-xl bg-white/10" />
        ))}
      </div>
    </PageFrame>
  );
}

export function TablePageSkeleton({
  title = "Loading",
  description = "Fetching this section.",
  rows = 5,
}: {
  title?: string;
  description?: string;
  rows?: number;
}) {
  return (
    <PageFrame title={title} description={description}>
      <div className="overflow-hidden rounded-2xl border border-white/10">
        <Skeleton className="h-10 w-full rounded-none bg-white/[0.06]" />
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton
            key={index}
            className="h-12 w-full rounded-none border-t border-white/5 bg-white/[0.04]"
          />
        ))}
      </div>
    </PageFrame>
  );
}

export function ReportingPageSkeleton() {
  return (
    <PageFrame
      title="Reporting"
      description="Revenue and conversion once the CRM and scoring engine are connected."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-24 rounded-2xl bg-white/10" />
        <Skeleton className="h-24 rounded-2xl bg-white/10" />
        <Skeleton className="h-24 rounded-2xl bg-white/10" />
      </div>
    </PageFrame>
  );
}

export function SettingsFormSkeleton({
  title = "Settings",
  fields = 3,
}: {
  title?: string;
  fields?: number;
}) {
  return (
    <PageFrame title={title} description="Loading this settings page.">
      <div className="max-w-xl space-y-4">
        {Array.from({ length: fields }).map((_, index) => (
          <div key={index}>
            <Skeleton className="mb-2 h-3 w-24 bg-white/10" />
            <Skeleton className="h-11 w-full rounded-xl bg-white/10" />
          </div>
        ))}
        <Skeleton className="h-10 w-28 rounded-full bg-white/10" />
      </div>
    </PageFrame>
  );
}

export function EmptyPageSkeleton({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <PageFrame title={title} description={description}>
      <Skeleton className="h-40 w-full rounded-2xl bg-white/10" />
    </PageFrame>
  );
}

export function DetailPageSkeleton({
  parentLabel,
  parentHref,
}: {
  parentLabel: string;
  parentHref: string;
}) {
  return (
    <PageFrame
      title="Loading"
      breadcrumbs={[
        { href: parentHref, label: parentLabel },
        { href: parentHref, label: "…" },
      ]}
    >
      <div className="space-y-3">
        <Skeleton className="h-32 w-full rounded-2xl bg-white/10" />
        <Skeleton className="h-24 w-full rounded-2xl bg-white/10" />
      </div>
    </PageFrame>
  );
}
