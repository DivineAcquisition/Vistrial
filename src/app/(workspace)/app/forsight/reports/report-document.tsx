import type { ForsightReport, ReportSection } from "@/lib/forsight/report/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { bodyText, captionText, sectionTitle } from "@/lib/ui";

/**
 * A generated report, as a document. Sequential, sectioned, readable top to
 * bottom. The numbers are the stored ones — this component never fetches.
 */
export function ReportDocument({
  report,
  generatedLabel,
  version,
}: {
  report: ForsightReport;
  generatedLabel: string;
  version: number;
}) {
  return (
    <article className="mx-auto max-w-2xl">
      <header className="border-b border-white/10 pb-8">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-300 uppercase">
          {report.workspace.name}
        </p>
        <h2 className="font-heading mt-2 text-3xl text-card-foreground">{report.period.label}</h2>
        <p className={`mt-3 ${bodyText}`}>
          Generated {generatedLabel}. Version {version}. This is a snapshot — the
          numbers in it will not move, even if the live dashboard later disagrees.
        </p>
      </header>

      <div className="divide-y divide-white/8">
        {report.sections.map((section) => (
          <section key={section.title} className="py-8">
            <h3 className={sectionTitle}>{section.title}</h3>
            <div className="mt-4">
              <SectionBody section={section} />
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

function SectionBody({ section }: { section: ReportSection }) {
  switch (section.kind) {
    case "absent":
      return <p className={bodyText}>{section.line}</p>;

    case "funnel":
      return (
        <ol className="space-y-3">
          {section.steps.map((step) => (
            <li key={step.label} className="flex items-baseline justify-between gap-4">
              <span className="text-sm text-card-foreground">{step.label}</span>
              <span className="text-right">
                <span className="font-semibold tabular-nums text-card-foreground">{step.count}</span>
                {step.fromPrevious ? (
                  <span className={`ml-3 ${captionText}`}>{step.fromPrevious} from the previous step</span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      );

    case "speed":
      return (
        <div className="space-y-8">
          {section.comparison ? <Comparison comparison={section.comparison} /> : null}
          <dl className="space-y-3">
            {section.figures.map((figure) => (
              <div key={figure.label} className="flex items-baseline justify-between gap-4">
                <dt className="text-sm text-muted-foreground">{figure.label}</dt>
                <dd className="font-semibold tabular-nums text-card-foreground">{figure.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      );

    case "revenue":
    case "nurture":
      return (
        <dl className="space-y-3">
          {section.figures.map((figure) => (
            <div key={figure.label} className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-muted-foreground">{figure.label}</dt>
              <dd className="font-semibold tabular-nums text-card-foreground">{figure.value}</dd>
            </div>
          ))}
        </dl>
      );

    case "team":
      return <ReportTable columns={section.table.columns} rows={section.table.rows} />;

    case "objections":
      return (
        <div className="space-y-5">
          <ReportTable columns={section.table.columns} rows={section.table.rows} />
          <p className={bodyText}>{section.interpretation}</p>
        </div>
      );
  }
}

function Comparison({
  comparison,
}: {
  comparison: Extract<ReportSection, { kind: "speed" }>["comparison"] & {};
}) {
  if (!comparison) return null;
  const max = Math.max(comparison.left.value, comparison.right.value, 1);
  return (
    <div>
      <p className="text-sm font-medium text-card-foreground">{comparison.title}</p>
      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <ComparisonBar side={comparison.left} max={max} />
        <ComparisonBar side={comparison.right} max={max} />
      </div>
      <p className={`mt-4 ${bodyText}`}>{comparison.interpretation}</p>
    </div>
  );
}

function ComparisonBar({
  side,
  max,
}: {
  side: { label: string; value: number; display: string };
  max: number;
}) {
  const width = Math.max(8, (side.value / max) * 100);
  return (
    <div>
      <p className={captionText}>{side.label}</p>
      <p className="mt-1 font-heading text-4xl tabular-nums text-card-foreground">{side.display}</p>
      <div className="mt-3 h-2 rounded-full bg-white/8">
        <div className="h-2 rounded-full bg-brand-500" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function ReportTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column}>{column}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={`${row[0]}-${index}`}>
            {row.map((cell, cellIndex) => (
              <TableCell
                key={`${cell}-${cellIndex}`}
                className={cellIndex === 0 ? "font-medium text-card-foreground" : "tabular-nums"}
              >
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
