import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A quiet tile behind an empty-state icon. Uses the existing surface tokens. */
export function IconStack({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
