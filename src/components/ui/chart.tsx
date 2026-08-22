import { cn } from "@/lib/utils";

/**
 * Small charts, drawn as plain SVG.
 *
 * No charting library: these sit next to a number that is already on the page,
 * and a dependency shipping its own tooltips, fonts and colour scale would cost
 * more than it explains.
 *
 * Every series is described in text as well, so the chart is decoration on top
 * of something a screen reader can already read. There is no line or area chart
 * here because nothing in the product yet produces a series to draw: the
 * figures are point-in-time rates and week-on-week deltas.
 */

export type ChartPoint = { label: string; value: number };

function bounds(points: ChartPoint[]) {
  const values = points.map((point) => point.value);
  return { max: Math.max(...values, 0) };
}

/** Horizontal bars, for comparing a handful of named things. */
export function BarChart({
  points,
  label,
  format = (value) => String(value),
  tone = "brand",
  className,
}: {
  points: ChartPoint[];
  label: string;
  format?: (value: number) => string;
  tone?: "brand" | "good" | "warning" | "critical";
  className?: string;
}) {
  if (points.length === 0) return null;
  const { max } = bounds(points);
  const fill = {
    brand: "bg-brand-500",
    good: "bg-flag-good",
    warning: "bg-flag-warning",
    critical: "bg-flag-critical",
  }[tone];

  return (
    <div className={cn("space-y-2.5", className)} role="group" aria-label={label}>
      {points.map((point) => (
        <div key={point.label} className="grid grid-cols-[minmax(6rem,9rem)_1fr_auto] items-center gap-3">
          <span className="truncate text-xs text-silver" title={point.label}>
            {point.label}
          </span>
          <span className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
            <span
              className={cn("block h-full rounded-full", fill)}
              style={{ width: `${max === 0 ? 0 : Math.round((point.value / max) * 100)}%` }}
            />
          </span>
          <span className="text-xs tabular-nums text-white">{format(point.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function ChartLegend({
  items,
  className,
}: {
  items: Array<{ label: string; tone: "brand" | "good" | "warning" | "critical" | "neutral" }>;
  className?: string;
}) {
  const dot = {
    brand: "bg-brand-500",
    good: "bg-flag-good",
    warning: "bg-flag-warning",
    critical: "bg-flag-critical",
    neutral: "bg-dim",
  };

  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs text-dim">
          <span className={cn("size-2 shrink-0 rounded-full", dot[item.tone])} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
