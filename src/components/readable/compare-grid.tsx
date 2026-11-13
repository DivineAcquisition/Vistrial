import type { ComparePage, CompareRow } from "@/lib/readable/teardown";
import { cn } from "@/lib/utils";

import { StatusChip, StatusIcon } from "./status-chip";

/**
 * Pages side by side: the framework's jobs down, the pages across, yours first. A cell says only "has a
 * section" or "no section". A real table, so a screen reader reads each cell with its row and column.
 */
export function CompareGrid({ columns, rows, className }: { columns: ComparePage[]; rows: CompareRow[]; className?: string }) {
  const hasOwn = columns.some((page) => page.own);
  const name = (page: ComparePage) => (page.own ? "Your page" : page.host);
  return (
    <div className={cn("min-w-0 overflow-x-auto rounded-xl border border-border", className)} tabIndex={0} role="region" aria-label="Which page has which section">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th scope="col" className="sticky left-0 bg-card px-3 py-2 font-medium">
              Section
            </th>
            {columns.map((page) => (
              <th key={page.id} scope="col" className={cn("max-w-28 px-2 py-2 text-center font-medium", page.own && "bg-primary/5 text-card-foreground")}>
                <span className="block truncate" title={page.host}>
                  {name(page)}
                </span>
              </th>
            ))}
            <th scope="col" className="px-3 py-2 font-medium">
              Other pages
            </th>
            {hasOwn ? (
              <th scope="col" className="px-3 py-2 font-medium">
                For you
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={cn("border-b border-border last:border-b-0", row.lacking && "bg-warning/5")}>
              <th scope="row" className={cn("sticky left-0 px-3 py-1.5 text-left font-medium text-card-foreground", row.lacking ? "bg-[color-mix(in_oklab,var(--warning)_5%,var(--card))]" : "bg-card")} title={`Answers "${row.objection}"`}>
                {row.name}
              </th>
              {row.has.map((has, index) => (
                <td key={columns[index].id} className={cn("px-2 py-1.5 text-center", columns[index].own && "bg-primary/5")}>
                  <StatusIcon tone={has ? "good" : "absent"} label={has ? "Has a section" : "No section"} className="align-middle" />
                </td>
              ))}
              <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground tabular-nums">
                {row.others} of {row.of}
              </td>
              {hasOwn ? <td className="px-3 py-1.5">{row.lacking ? <StatusChip tone="partly" label="Yours lacks this" /> : row.onlyYours ? <StatusChip tone="quiet" label="Only yours has it" /> : null}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
