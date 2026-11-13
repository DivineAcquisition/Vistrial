import type { ReactNode } from "react";

import { ArrowRight, Target } from "@/components/icons";
import { cn } from "@/lib/utils";

import { EvidenceLabel } from "./evidence-label";

/**
 * What to do next, kept in reach. `sticky` holds it to the bottom of the screen while the result is in view;
 * `inline` leaves it where it is written. It only repeats a step the result already contains.
 */
export function NextStep({ title, label, note, href, action, look = "sticky", className }: { title: string; label?: string | null; note?: ReactNode; href?: string; action?: ReactNode; look?: "sticky" | "inline"; className?: string }) {
  return (
    <aside aria-label="What to do next" className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-primary/30 bg-card px-3 py-2.5 sm:px-4", look === "sticky" && "sticky bottom-3 z-10 shadow-lg shadow-black/10", className)}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Target aria-hidden className="size-4" />
      </span>
      <div className="grid min-w-0 flex-1 basis-56 gap-0.5">
        <p className="flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          What to do next
          {label ? <EvidenceLabel label={label} className="tracking-normal normal-case" /> : null}
        </p>
        <p className="text-sm font-medium text-card-foreground">{title}</p>
        {note ? <p className={cn("text-xs text-muted-foreground", look === "sticky" && "hidden sm:block")}>{note}</p> : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {action}
        {href ? (
          <a href={href} className="inline-flex items-center gap-1 rounded-md text-sm text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
            See the change <ArrowRight aria-hidden className="size-3.5" />
          </a>
        ) : null}
      </div>
    </aside>
  );
}
