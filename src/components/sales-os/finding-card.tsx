import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Finding } from "@/lib/sales-os/analysis";
import { captionText, cardTitle } from "@/lib/ui";
import { cn } from "@/lib/utils";

/** An analysis result: one statement about the business, with the evidence and sample attached. */
export function FindingCard({ finding }: { finding: Finding }) {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="space-y-2 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cardTitle}>{finding.title}</h3>
          {!finding.enough ? <Badge variant="warning">Not enough data</Badge> : null}
        </div>
        <p className="text-sm leading-relaxed text-card-foreground">{finding.headline}</p>
        <p className={captionText}>Based on {finding.sample}.</p>
      </div>

      {finding.points.length ? (
        <dl className="grid gap-x-6 gap-y-2 px-4 py-3 sm:grid-cols-2">
          {finding.points.map((point, index) => (
            <div key={`${point.label}-${index}`} className="min-w-0">
              <dt className={captionText}>{point.label}</dt>
              <dd className={cn("text-sm tabular-nums", point.enough ? "text-card-foreground" : "text-muted-foreground")}>
                {point.value}
                {point.detail ? <span className="block text-xs text-muted-foreground">{point.detail}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {finding.table && finding.table.rows.length ? (
        <div className="border-t border-border px-2 py-2">
          <Table>
            <TableHeader>
              <TableRow>
                {finding.table.columns.map((column) => (
                  <TableHead key={column}>{column}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {finding.table.rows.map((row, index) => (
                <TableRow key={index}>
                  {row.map((cell, cellIndex) => (
                    <TableCell key={cellIndex} className={cellIndex === 0 ? "font-medium" : "tabular-nums"}>
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {finding.records?.length ? (
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
          {finding.records.map((record) => (
            <Link key={record.href + record.label} href={record.href} className="text-sm text-brand-700 underline-offset-4 hover:underline">
              {record.label}
            </Link>
          ))}
        </div>
      ) : null}

      {finding.quotes?.length ? (
        <div className="space-y-2 border-t border-border px-4 py-3">
          <p className={captionText}>In their words</p>
          {finding.quotes.map((quote, index) => (
            <blockquote key={index} className="border-l-2 border-brand-500/50 pl-3 text-sm text-card-foreground">
              “{quote.text}”
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {quote.context}
                {quote.href ? (
                  <>
                    {" "}
                    <Link href={quote.href} className="text-brand-700 underline-offset-4 hover:underline">
                      Open their file
                    </Link>
                  </>
                ) : null}
              </span>
            </blockquote>
          ))}
        </div>
      ) : null}

      {finding.caveats.length ? (
        <ul className="space-y-1 border-t border-border bg-muted/40 px-4 py-3">
          {finding.caveats.map((caveat, index) => (
            <li key={index} className={captionText}>
              {caveat}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
