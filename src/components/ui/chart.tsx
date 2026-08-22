import { cn } from "@/lib/utils";

/**
 * Small charts, drawn as plain SVG.
 *
 * No charting library: these show a shape and a direction next to a number that
 * is already on the page, and a dependency that ships its own tooltips, fonts
 * and colour scale would cost more than it explains.
 *
 * Every series is described in text as well, so the chart is decoration on top
 * of something a screen reader can already read.
 */

export type ChartPoint = { label: string; value: number };

function bounds(points: ChartPoint[]) {
  const values = points.map((point) => point.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  return { min, max, span: max - min || 1 };
}

/** A line or filled area, for a figure moving over time. */
export function Sparkline({
  points,
  label,
  filled = true,
  tone = "brand",
  height = 48,
  className,
}: {
  points: ChartPoint[];
  /** Describes the series for anyone who cannot see it. */
  label: string;
  filled?: boolean;
  tone?: "brand" | "good" | "warning" | "critical";
  height?: number;
  className?: string;
}) {
  if (points.length < 2) return null;

  const width = 100;
  const { min, span } = bounds(points);
  const stroke = {
    brand: "var(--color-brand-500)",
    good: "var(--color-flag-good)",
    warning: "var(--color-flag-warning)",
    critical: "var(--color-flag-critical)",
  }[tone];

  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - ((point.value - min) / span) * (height - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const line = `M${coords.join(" L")}`;
  const area = `${line} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];

  return (
    <figure className={cn("m-0", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-12 w-full"
        role="img"
        aria-label={`${label}. ${points.length} points, from ${points[0].value} to ${last.value}.`}
      >
        {filled ? <path d={area} fill={stroke} fillOpacity={0.12} /> : null}
        <path
          d={line}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </figure>
  );
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
          <span className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
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
