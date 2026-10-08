import { Skeleton } from "@/components/ui/skeleton";

export default function AskLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pt-6" role="status" aria-label="Reading your numbers">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <p className="text-sm text-muted-foreground">Reading your leads, calls, and outcomes…</p>
    </div>
  );
}
