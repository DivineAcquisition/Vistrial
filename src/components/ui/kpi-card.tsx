import type { ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { toneValueClass, type Tone } from "@/components/ui/tone";
import { metricValue } from "@/lib/ui";
import { cn } from "@/lib/utils";

export type TrendDirection = "up" | "down" | "flat";

/**
 * A change against a previous period.
 *
 * Direction and meaning are separate on purpose: speed-to-lead going up is bad
 * and close rate going up is good, so the arrow follows the number and the
 * colour follows `isGood`.
 */
export function Trend({
  direction,
  value,
  comparison,
  isGood,
  className,
}: {
  direction: TrendDirection;
  /** Already formatted, e.g. "4.2 pts" or "12%". */
  value: string;
  /** What it is measured against, e.g. "on last week". */
  comparison?: string;
  isGood?: boolean;
  className?: string;
}) {
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : ArrowRight;
  const tone =
    direction === "flat" || isGood === undefined
      ? "text-silver"
      : isGood
        ? "text-flag-good"
        : "text-flag-critical";

  const spoken =
    direction === "flat" ? "no change" : direction === "up" ? "up" : "down";

  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", className)}>
      <Icon className={cn("size-3.5 shrink-0", tone)} aria-hidden />
      <span className={tone}>
        <span className="sr-only">{spoken} </span>
        {value}
      </span>
      {comparison ? <span className="text-muted-foreground">{comparison}</span> : null}
    </span>
  );
}

/**
 * Metric card. The top border is always the brand; the tone colours the value,
 * never the chrome.
 */
export function KpiCard({
  label,
  value,
  tone = "neutral",
  sub,
  trend,
  footer,
  className,
}: {
  label: string;
  value: string | number;
  tone?: Tone;
  sub?: string;
  trend?: ReactNode;
  /** A sparkline or meter under the value. */
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "panel-hover border-t-2 border-t-primary p-5",
        className
      )}
    >
      <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">{label}</p>
      <p className={cn("mt-1.5", metricValue, toneValueClass(tone))}>{value}</p>
      {trend ? <div className="mt-1.5">{trend}</div> : null}
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
      {footer ? <div className="mt-3">{footer}</div> : null}
    </Card>
  );
}

export function KpiGrid({
  children,
  columns = 4,
}: {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
}) {
  const cols = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
  }[columns];

  return <div className={cn("grid gap-4", cols)}>{children}</div>;
}
