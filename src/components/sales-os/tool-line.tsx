import { CheckIcon, CircleAlertIcon } from "lucide-react";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** What Vistrial is doing, in a sentence. Never a function name. */
export function ToolLine({
  state,
  children,
  className,
}: {
  state: "running" | "done" | "failed";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)} aria-live="polite">
      {state === "running" ? (
        <Spinner className="size-3.5" />
      ) : state === "done" ? (
        <CheckIcon className="size-3.5 text-brand-300" aria-hidden />
      ) : (
        <CircleAlertIcon className="size-3.5 text-destructive" aria-hidden />
      )}
      <span className={cn(state === "running" && "shimmer motion-reduce:animate-none")}>{children}</span>
    </p>
  );
}
