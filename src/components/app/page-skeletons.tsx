import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading shapes that match what replaces them.
 *
 * A skeleton the wrong size is worse than none: the page jumps when the real
 * content lands, which reads as a bug rather than as loading. Heights here
 * track the control scale — 40px controls, 44px table rows, 2xl card corners.
 */

function Loading({ label }: { label: string }) {
  return (
    <span role="status" className="sr-only">
      {label}
    </span>
  );
}

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
      <Loading label="Loading list" />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-2xl" />
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
      <Loading label="Loading table" />
      <div className="panel overflow-hidden rounded-2xl">
        <div className="surface-sunken h-11 border-x-0 border-t-0" />
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="flex h-[3.25rem] items-center gap-4 border-b border-white/[0.06] px-4 last:border-b-0"
          >
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="hidden h-3.5 w-24 sm:block" />
            <Skeleton className="ml-auto h-3.5 w-16" />
          </div>
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
      <Loading label="Loading reporting" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="panel rounded-2xl border-t-2 border-t-brand-500/40 px-5 py-4">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="mt-3 h-7 w-20" />
            <Skeleton className="mt-3 h-2.5 w-28" />
          </div>
        ))}
      </div>
      <Panel className="mt-6 p-6">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-4 h-24 w-full rounded-xl" />
      </Panel>
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
      <Loading label="Loading settings" />
      <Panel className="max-w-xl p-6">
        <div className="space-y-4">
          {Array.from({ length: fields }).map((_, index) => (
            <div key={index}>
              <Skeleton className="mb-2 h-2.5 w-24" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ))}
          <Skeleton className="mt-2 h-10 w-24 rounded-full" />
        </div>
      </Panel>
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
      <Loading label="Loading" />
      <Skeleton className="h-40 w-full rounded-2xl" />
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
      <Loading label="Loading details" />
      <div className="space-y-4">
        <Panel className="p-6">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-4 h-20 w-full rounded-xl" />
        </Panel>
        <Panel className="p-6">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-14 w-full rounded-xl" />
        </Panel>
      </div>
    </PageFrame>
  );
}
