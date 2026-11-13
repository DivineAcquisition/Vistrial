import type { ReactNode } from "react";

import type { Point } from "@/lib/readable/teardown";
import { cn } from "@/lib/utils";

import { Detail } from "./detail";
import { EvidenceLabel } from "./evidence-label";
import { StatusIcon, type ChipTone } from "./status-chip";

function Row({ point, tone, href }: { point: Point; tone: ChipTone; href?: (index: number) => string }) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5">
      <StatusIcon tone={tone} label={tone === "good" ? "Holds up:" : "Weak point:"} className="mt-0.5" />
      <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-card-foreground">
        {point.sectionIndex !== null && href ? (
          <a href={href(point.sectionIndex)} className="underline-offset-2 hover:underline focus-visible:underline">
            {point.text}
          </a>
        ) : (
          point.text
        )}
        <EvidenceLabel label={point.label} />
      </p>
      {point.detail ? <p className="col-start-2 line-clamp-2 text-sm text-muted-foreground">{point.detail}</p> : null}
    </li>
  );
}

/**
 * The few things that matter most, in two short lists. It shows the first `limit` of each and keeps the rest
 * one step away. The order is the fixed rule in lib/readable/teardown.ts, stated under the lists.
 */
export function TopList({ strongest, weakest, limit = 3, sectionHref, footnote, className }: { strongest: Point[]; weakest: Point[]; limit?: number; sectionHref?: (index: number) => string; footnote?: ReactNode; className?: string }) {
  const column = (title: string, points: Point[], tone: ChipTone, none: string) => (
    <div className="grid content-start gap-2 rounded-xl border border-border p-3">
      <h4 className="flex items-baseline justify-between gap-2 font-heading text-sm text-card-foreground">
        {title}
        <span className="text-xs font-normal text-muted-foreground tabular-nums">
          {Math.min(limit, points.length)} of {points.length}
        </span>
      </h4>
      {points.length === 0 ? <p className="text-sm text-muted-foreground">{none}</p> : null}
      <ul className="grid gap-2.5">
        {points.slice(0, limit).map((point) => (
          <Row key={point.text} point={point} tone={tone} href={sectionHref} />
        ))}
      </ul>
      {points.length > limit ? (
        <Detail summary={`${points.length - limit} more`}>
          <ul className="grid gap-2.5">
            {points.slice(limit).map((point) => (
              <Row key={point.text} point={point} tone={tone} href={sectionHref} />
            ))}
          </ul>
        </Detail>
      ) : null}
    </div>
  );
  return (
    <div className={cn("grid gap-2", className)}>
      <div className="grid gap-3 md:grid-cols-2">
        {column("Weakest points", weakest, "bad", "Nothing was read as weak or missing.")}
        {column("What holds up", strongest, "good", "Nothing was read as doing its job.")}
      </div>
      {footnote ? <p className="text-xs text-muted-foreground">{footnote}</p> : null}
    </div>
  );
}
