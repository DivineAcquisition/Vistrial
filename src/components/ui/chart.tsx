import { cn } from "@/lib/utils";

/**
 * Small charts, drawn as plain SVG.
 *
 * No charting library: these sit next to a number that is already on the page,
 * and a dependency shipping its own tooltips, fonts and colour scale would cost
 * more than it explains.
 *
 * Every series is described in text as well, so the chart is decoration on top
 * of something a screen reader can already read.
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

/** The same points as a table, for anyone not reading the picture. */
function SeriesTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: Array<{ label: string; cells: string[] }>;
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Period</th>
          {columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            {row.cells.map((cell, index) => (
              <td key={columns[index] ?? index}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * One measure over time, oldest to newest. Drawn as a line because the shape
 * between the points is the message: a cost drifting upward week on week is
 * creative fatigue, and it is legible here before it is legible in a table.
 */
export function LineChart({
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

  const stroke = {
    brand: "stroke-brand-500",
    good: "stroke-flag-good",
    warning: "stroke-flag-warning",
    critical: "stroke-flag-critical",
  }[tone];
  const fill = {
    brand: "fill-brand-500",
    good: "fill-flag-good",
    warning: "fill-flag-warning",
    critical: "fill-flag-critical",
  }[tone];

  const values = points.map((point) => point.value);
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const width = 100;
  const height = 34;

  const coords = points.map((point, index) => ({
    ...point,
    x: points.length === 1 ? width / 2 : (index / (points.length - 1)) * width,
    y: height - ((point.value - min) / span) * height,
  }));

  return (
    <figure className={cn("space-y-2", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-32 w-full overflow-visible"
        role="presentation"
        aria-hidden
      >
        <polyline
          points={coords.map((point) => `${point.x},${point.y}`).join(" ")}
          className={cn("fill-none", stroke)}
          strokeWidth={1}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {coords.map((point) => (
          <circle key={point.label} cx={point.x} cy={point.y} r={1.4} className={fill} />
        ))}
      </svg>
      <div className="flex items-baseline justify-between gap-3 text-xs text-dim">
        <span className="truncate">{coords[0]?.label}</span>
        <span className="tabular-nums text-silver">
          {format(coords[coords.length - 1]?.value ?? 0)}
        </span>
        {coords.length > 1 ? (
          <span className="truncate text-right">{coords[coords.length - 1]?.label}</span>
        ) : null}
      </div>
      <figcaption>
        <SeriesTable
          caption={label}
          columns={[label]}
          rows={points.map((point) => ({ label: point.label, cells: [format(point.value)] }))}
        />
      </figcaption>
    </figure>
  );
}

export type ChartSeries = { label: string; tone: "brand" | "good" | "warning" | "critical" };

/**
 * Several measures side by side within each period. Used for a funnel, where
 * the point is not any single bar but how much shorter each one is than the
 * one to its left.
 */
export function GroupedBarChart({
  groups,
  series,
  label,
  format = (value) => String(value),
  className,
}: {
  groups: Array<{ label: string; values: number[] }>;
  series: ChartSeries[];
  label: string;
  format?: (value: number) => string;
  className?: string;
}) {
  if (groups.length === 0 || series.length === 0) return null;

  const max = Math.max(...groups.flatMap((group) => group.values), 0);
  const fill = {
    brand: "bg-brand-500",
    good: "bg-flag-good",
    warning: "bg-flag-warning",
    critical: "bg-flag-critical",
  };

  return (
    <figure className={cn("space-y-3", className)}>
      <div
        className="flex items-end gap-4 overflow-x-auto pb-1"
        role="presentation"
        aria-hidden
      >
        {groups.map((group) => (
          <div key={group.label} className="flex min-w-16 flex-1 flex-col gap-1.5">
            <div className="flex h-28 items-end gap-1">
              {series.map((entry, index) => {
                const value = group.values[index] ?? 0;
                return (
                  <span
                    key={entry.label}
                    title={`${entry.label}: ${format(value)}`}
                    className="flex-1 rounded-t-sm bg-white/[0.04]"
                    style={{ height: "100%" }}
                  >
                    <span
                      className={cn("block h-full w-full origin-bottom rounded-t-sm", fill[entry.tone])}
                      style={{ transform: `scaleY(${max === 0 ? 0 : value / max})` }}
                    />
                  </span>
                );
              })}
            </div>
            <span className="truncate text-center text-[11px] text-dim" title={group.label}>
              {group.label}
            </span>
          </div>
        ))}
      </div>
      <ChartLegend items={series.map((entry) => ({ label: entry.label, tone: entry.tone }))} />
      <figcaption>
        <SeriesTable
          caption={label}
          columns={series.map((entry) => entry.label)}
          rows={groups.map((group) => ({
            label: group.label,
            cells: series.map((_, index) => format(group.values[index] ?? 0)),
          }))}
        />
      </figcaption>
    </figure>
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
