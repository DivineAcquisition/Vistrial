import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { ComparisonLine } from "@/app/(workspace)/app/home/number-cards";
import { Card } from "@/components/ui/card";
import type { Comparison } from "@/lib/home/metrics";
import { cn } from "@/lib/utils";

/** "How is this calculated?" one tap away, without leaving the page. */
export function MetricExplain({ explain, className }: { explain: string; className?: string }) {
  return (
    <details className={cn("group/explain text-xs text-muted-foreground", className)}>
      <summary className="cursor-pointer list-none rounded-md font-medium text-brand-300 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        How is this calculated?
      </summary>
      <p className="mt-1.5 leading-relaxed">{explain}</p>
    </details>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  note,
  comparison,
  explain,
  href,
  className,
}: {
  label: string;
  value: string;
  sub?: string | null;
  note?: string | null;
  comparison?: Comparison | null;
  explain: string;
  href?: string | null;
  className?: string;
}) {
  const body = (
    <>
      <p className="flex items-start justify-between gap-2 text-xs leading-snug font-medium text-muted-foreground">
        <span className="min-w-0">{label}</span>
        {href ? (
          <ChevronRight className="size-3.5 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" aria-hidden />
        ) : null}
      </p>
      <p className="mt-2 truncate text-2xl font-semibold tabular-nums text-card-foreground sm:text-3xl">{value}</p>
      {sub ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{sub}</p> : null}
    </>
  );
  return (
    <Card className={cn("min-w-0 gap-0 p-4 sm:p-5", className)}>
      {href ? (
        <Link
          href={href}
          aria-label={`${label}: ${value}. Show the leads behind this number`}
          className="group -m-1 rounded-xl p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {body}
        </Link>
      ) : (
        body
      )}
      <ComparisonLine comparison={comparison ?? null} className="mt-2 text-xs" />
      {note ? <p className="mt-2 text-xs text-warning">{note}</p> : null}
      <MetricExplain explain={explain} className="mt-3" />
    </Card>
  );
}

export type BarRow = { key: string; label: string; value: number; display?: string; href?: string | null };

/**
 * Horizontal bars drawn with the existing tokens, with the numbers written
 * out, so the chart is also a readable table.
 */
export function BarList({ rows, label, empty }: { rows: BarRow[]; label: string; empty?: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty ?? "Nothing in this range."}</p>;
  }
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1);
  return (
    <table className="w-full border-separate border-spacing-y-1.5 text-sm" aria-label={label}>
      <thead className="sr-only">
        <tr>
          <th scope="col">Group</th>
          <th scope="col">Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const width = `${Math.max(2, Math.round((Math.abs(row.value) / max) * 100))}%`;
          const name = row.href ? (
            <Link href={row.href} className="text-card-foreground underline-offset-4 hover:underline">
              {row.label}
            </Link>
          ) : (
            <span className="text-card-foreground">{row.label}</span>
          );
          return (
            <tr key={row.key}>
              <th scope="row" className="w-2/5 max-w-0 pr-3 text-left font-normal">
                <span className="block truncate">{name}</span>
              </th>
              <td className="align-middle">
                <span className="flex items-center gap-2">
                  <span className="h-2 min-w-0 flex-1 rounded-full bg-muted/60">
                    <span className="block h-2 rounded-full bg-brand-500/70" style={{ width }} />
                  </span>
                  <span className="w-16 shrink-0 text-right tabular-nums text-card-foreground">
                    {row.display ?? new Intl.NumberFormat("en-US").format(row.value)}
                  </span>
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
