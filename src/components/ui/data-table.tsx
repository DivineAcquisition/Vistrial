import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DataTableColumn = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  /** Hidden below `sm`, for a column that is context rather than content. */
  hideOnMobile?: boolean;
  width?: string;
};

export type DataTableRow = Record<string, ReactNode> & {
  /** Marks the row selected and tints it. */
  selected?: boolean;
};

/**
 * The read-only table.
 *
 * Anything interactive — sorting, selection, bulk actions — needs client state,
 * so it lives in `DataTableToolbar` and the screen that owns the data. This
 * stays a server component so a list can render without shipping JavaScript.
 */
export function DataTable({
  columns,
  rows,
  empty = "Nothing here yet.",
  loading = false,
  loadingRows = 5,
  caption,
  className,
}: {
  columns: DataTableColumn[];
  rows: DataTableRow[];
  /** Shown when there is genuinely nothing. Say what would put something here. */
  empty?: ReactNode;
  loading?: boolean;
  loadingRows?: number;
  caption?: string;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden py-0", className)}>
      <Table>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead
                key={column.key}
                align={column.align}
                style={column.width ? { width: column.width } : undefined}
                className={cn(column.hideOnMobile && "hidden sm:table-cell")}
              >
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: loadingRows }).map((_, rowIndex) => (
              <TableRow key={`skeleton-${rowIndex}`} className="hover:bg-transparent">
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn(column.hideOnMobile && "hidden sm:table-cell")}
                  >
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="px-4 py-12 text-center text-sm text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, rowIndex) => (
              <TableRow key={rowIndex} data-state={row.selected ? "selected" : undefined}>
                {columns.map((column, columnIndex) => (
                  <TableCell
                    key={column.key}
                    align={column.align}
                    className={cn(
                      columnIndex === 0 ? "font-medium text-card-foreground" : "text-muted-foreground",
                      column.align !== "right" && columnIndex !== 0 && "tabular-nums",
                      column.hideOnMobile && "hidden sm:table-cell"
                    )}
                  >
                    {row[column.key]}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

/**
 * The bar above a table: search and filters on the left, what is selected and
 * what you can do with it on the right. Rendering it separately keeps the table
 * itself free of state.
 */
export function DataTableToolbar({
  search,
  filters,
  selectedCount = 0,
  bulkActions,
  actions,
  className,
}: {
  search?: ReactNode;
  filters?: ReactNode;
  selectedCount?: number;
  bulkActions?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const selecting = selectedCount > 0;

  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap items-center gap-3",
        selecting && "rounded-xl border border-brand-500/30 bg-brand-500/[0.06] px-3 py-2",
        className
      )}
    >
      {selecting ? (
        <>
          <p aria-live="polite" className="text-sm text-card-foreground">
            {selectedCount} selected
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-2">{bulkActions}</div>
        </>
      ) : (
        <>
          {search ? <div className="min-w-[12rem] flex-1 sm:max-w-xs">{search}</div> : null}
          {filters ? <div className="flex flex-wrap items-center gap-2">{filters}</div> : null}
          {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
        </>
      )}
    </div>
  );
}
