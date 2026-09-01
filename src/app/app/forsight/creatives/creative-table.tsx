import { BarChart } from "@/components/ui/chart";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Tone } from "@/components/ui/tone";
import {
  comparableByCostPerAuditHeld,
  totalSpend,
  type CreativeRow,
} from "@/lib/forsight/creatives";
import { formatMetric, formatNumber, type MetricFormat } from "@/lib/forsight/values";

const STATUS_TONE: Record<string, Tone> = {
  winner: "good",
  testing: "warning",
  paused: "neutral",
  killed: "critical",
};

const COLUMNS: Array<{
  label: string;
  read: (row: CreativeRow) => string;
}> = [
  { label: "Spend", read: (row) => formatMetric(row.spend, "currency") },
  { label: "CTR", read: (row) => formatMetric(row.ctr, "percent") },
  { label: "Cost / lead", read: (row) => formatMetric(row.costPerLead, "currency") },
  {
    label: "Cost / qualified",
    read: (row) => formatMetric(row.costPerQualifiedLead, "currency"),
  },
  { label: "Cost / audit held", read: (row) => formatMetric(row.costPerAuditHeld, "currency") },
  { label: "CAC", read: (row) => formatMetric(row.cac, "currency") },
];

const CURRENCY: MetricFormat = "currency";

export function CreativeTable({ rows }: { rows: CreativeRow[] }) {
  const comparison = comparableByCostPerAuditHeld(rows);
  const spend = totalSpend(rows);

  return (
    <>
      <section>
        <SectionHeader
          title="Cost per audit held, by creative"
          hint="The kill or scale decision, side by side."
        />
        <Panel className="p-5">
          {comparison.length > 0 ? (
            <BarChart
              points={comparison}
              label="Cost per audit held by creative"
              format={(value) => formatNumber(value, CURRENCY)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No creative has produced an audit yet, so there is nothing to compare. The table
              below shows what each one has spent so far.
            </p>
          )}
          <p className="mt-4 text-xs text-dim">
            Judged on cost per audit held, never cost per lead.
          </p>
        </Panel>
      </section>

      <section>
        <SectionHeader
          title="Every creative"
          hint="Best cost per audit held first. Creatives with no audits yet sit below the ones with real numbers."
        />
        <Panel>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Creative</TableHead>
                <TableHead>Status</TableHead>
                {COLUMNS.map((column) => (
                  <TableHead key={column.label} className="text-right">
                    {column.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-card-foreground">{row.name}</TableCell>
                  <TableCell>
                    {row.status ? (
                      <StatusBadge
                        label={row.status}
                        tone={STATUS_TONE[row.status.toLowerCase()] ?? "neutral"}
                      />
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </TableCell>
                  {COLUMNS.map((column) => (
                    <TableCell key={column.label} className="text-right tabular-nums">
                      {column.read(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>
                  {rows.length} creative{rows.length === 1 ? "" : "s"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMetric(spend, CURRENCY)}
                </TableCell>
                <TableCell colSpan={COLUMNS.length - 1} />
              </TableRow>
            </TableFooter>
          </Table>
        </Panel>
      </section>
    </>
  );
}
