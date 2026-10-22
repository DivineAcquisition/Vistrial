import Link from "next/link";

import { formatMetricValue } from "@/lib/metrics/format";
import type { OutcomeTile } from "@/lib/workspace/outcomes";
import { contributionLine, OUTCOME_COPY } from "@/lib/workspace/voice";
import { cn } from "@/lib/utils";

function formatValue(unit: OutcomeTile["unit"], value: number | null): string {
  return value === null ? "None yet" : formatMetricValue({ unit }, value);
}

/** Seven daily values as a quiet line. Days with no value are gaps, not zeros. */
function Trend({ values, label }: { values: Array<number | null>; label: string }) {
  const known = values.filter((value): value is number => value !== null);
  if (known.length < 2) return null;
  const max = Math.max(...known);
  const min = Math.min(...known);
  const span = max - min || 1;
  const width = 84;
  const height = 24;
  const step = width / (values.length - 1);
  const segments: string[] = [];
  let open = false;
  values.forEach((value, index) => {
    if (value === null) {
      open = false;
      return;
    }
    const x = index * step;
    const y = height - 2 - ((value - min) / span) * (height - 4);
    segments.push(`${open ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`);
    open = true;
  });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`${label}, last seven days: ${values.map((value) => (value === null ? "no data" : value)).join(", ")}`} className="text-brand-300">
      <path d={segments.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function OutcomeStrip({
  tiles,
  contribution,
  liveDays,
}: {
  tiles: OutcomeTile[];
  contribution: { caseFiles: number; clocks: number; drafts: number } | null;
  liveDays: number | null;
}) {
  const line = contribution ? contributionLine(contribution) : null;
  if (!tiles.length) {
    return liveDays !== null && liveDays < 7 ? <p className="text-sm text-muted-foreground">{OUTCOME_COPY.collecting(Math.max(1, liveDays))}</p> : null;
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.id}>
            <Link href={tile.href} title={tile.explain} className="flex h-full flex-col gap-1 rounded-xl border border-border bg-card p-3 hover:border-overlay/[0.14] focus-visible:ring-2 focus-visible:ring-ring">
              <span className="text-xs text-muted-foreground">{tile.label}</span>
              <span className="font-heading text-xl text-card-foreground">{formatValue(tile.unit, tile.value)}</span>
              {tile.trend ? <Trend values={tile.trend} label={tile.label} /> : null}
              {tile.change ? (
                <span className={cn("text-xs", tile.change.better ? "text-success" : "text-muted-foreground")}>
                  {formatValue(tile.unit, tile.change.previous)} {OUTCOME_COPY.vsLast}
                </span>
              ) : tile.compareNote ? (
                <span className="text-xs text-muted-foreground">{tile.compareNote}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      {line ? <p className="text-sm text-muted-foreground">{line}</p> : null}
    </div>
  );
}
