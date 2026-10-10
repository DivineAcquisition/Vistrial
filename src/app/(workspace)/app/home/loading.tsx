import { AttentionSkeleton, StatCardsSkeleton } from "@/app/(workspace)/app/home/portal-sections";
import { ActivitySkeleton, QueueSkeleton } from "@/app/(workspace)/app/home/sections";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 sm:gap-6">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-8 w-40" />
      </div>
      <AttentionSkeleton />
      <StatCardsSkeleton />
      <QueueSkeleton />
      <ActivitySkeleton />
    </div>
  );
}
