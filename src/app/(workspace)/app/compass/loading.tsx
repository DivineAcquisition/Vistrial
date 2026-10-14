import { Skeleton } from "@/components/ui/skeleton";

export default function CompassLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-6" role="status" aria-label="Opening Compass">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-12 w-full rounded-xl" />
    </div>
  );
}
