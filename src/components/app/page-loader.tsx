import LoaderOneDemo from "@/components/loader-one-demo";
import { cn } from "@/lib/utils";

/** Route-level wait state. Uses Aceternity Loader One, not a content skeleton. */
export function PageLoader({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-sm text-muted-foreground",
        className,
      )}
    >
      <LoaderOneDemo />
      <span role="status">{label}</span>
    </div>
  );
}
