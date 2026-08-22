import { cn } from "@/lib/utils";

/**
 * A placeholder shaped like the thing that is coming.
 *
 * Kept dim on purpose: a skeleton brighter than the content it stands in for
 * pulls the eye to the part of the page with nothing in it.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("animate-pulse rounded-md bg-white/[0.06]", className)}
      {...props}
    />
  );
}

export { Skeleton };
