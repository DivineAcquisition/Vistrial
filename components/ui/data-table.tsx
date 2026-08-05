import type { ReactNode } from "react";

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
};

const alignClasses = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

export function DataTable({
  columns,
  rows,
  empty = "Nothing here yet.",
}: {
  columns: DataTableColumn[];
  rows: Record<string, ReactNode>[];
  empty?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary hover:bg-secondary">
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn(
                  "text-[11px] font-medium tracking-wider text-secondary-foreground uppercase",
                  alignClasses[column.align ?? "left"]
                )}
              >
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={columns.length}
                className="py-10 text-center text-sm text-dim"
              >
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, rowIndex) => (
              <TableRow
                key={rowIndex}
                className={cn(
                  "border-b border-border/60",
                  rowIndex % 2 === 1 && "bg-white/[0.015]"
                )}
              >
                {columns.map((column, columnIndex) => (
                  <TableCell
                    key={column.key}
                    className={cn(
                      columnIndex === 0
                        ? "font-medium text-white"
                        : "text-sm text-silver",
                      alignClasses[column.align ?? "left"]
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
    </div>
  );
}
