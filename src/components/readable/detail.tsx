import type { ReactNode } from "react";

import { ChevronDown } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Layer three: the full text, one step away. A native disclosure, so it opens with Enter or Space, is announced
 * as collapsed or expanded, needs no script and no animation, and a browser's find-in-page opens it.
 */
export function Detail({ summary, aside, defaultOpen = false, children, className, id }: { summary: ReactNode; aside?: ReactNode; defaultOpen?: boolean; children: ReactNode; className?: string; id?: string }) {
  return (
    <details id={id} open={defaultOpen} className={cn("group/detail min-w-0", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md text-sm text-primary outline-none select-none hover:underline focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ChevronDown aria-hidden className="size-4 shrink-0 -rotate-90 group-open/detail:rotate-0" />
        <span className="min-w-0">{summary}</span>
        {aside ? <span className="ml-auto shrink-0 text-xs text-muted-foreground">{aside}</span> : null}
      </summary>
      <div className="mt-2 grid min-w-0 gap-2">{children}</div>
    </details>
  );
}
