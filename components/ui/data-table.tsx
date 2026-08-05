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
    <div className="panel overflow-hidden rounded-2xl">
      <Table>
        <TableHeader>
          <TableRow className="border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.02]">
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn(
                  "h-11 px-4 text-[10px] font-semibold tracking-[0.14em] text-neutral-500 uppercase",
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
                className="px-4 py-12 text-center text-sm text-neutral-500"
              >
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, rowIndex) => (
              <TableRow
                key={rowIndex}
                className="border-white/[0.05] hover:bg-white/[0.02]"
              >
                {columns.map((column, columnIndex) => (
                  <TableCell
                    key={column.key}
                    className={cn(
                      "px-4 py-3.5",
                      columnIndex === 0
                        ? "font-medium text-white"
                        : "text-neutral-300 tabular-nums",
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
