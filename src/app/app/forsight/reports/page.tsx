import Link from "next/link";

import { ReportActions } from "@/app/app/forsight/reports/report-actions";
import { ForsightTabs } from "@/app/app/forsight/forsight-chrome";
import { PageFrame } from "@/components/app/page-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { previousMonthStart } from "@/lib/forsight/report/build";
import { listReportPeriods, periodPath } from "@/lib/forsight/report/load";
import { FORSIGHT_PATH } from "@/lib/navigation";
import { requireReportingAccess } from "@/lib/reporting/access";
import { createClient } from "@/lib/supabase/server";
import { isoDate } from "@/lib/forsight/weeks";

export const dynamic = "force-dynamic";

export const metadata = { title: "Reports · Forsight" };

export default async function ForsightReportsPage() {
  const ctx = await requireReportingAccess();
  const supabase = await createClient();
  const periods = await listReportPeriods(supabase, ctx.org.id);
  const lastMonth = previousMonthStart(isoDate(new Date()));
  const hasLastMonth = periods.some((row) => row.periodStart === lastMonth);

  return (
    <PageFrame
      title="Monthly reports"
      eyebrow={ctx.org.name}
      description="A snapshot of what happened last month. Once generated, the numbers in a report do not move."
      toolbar={<ForsightTabs activeHref={`${FORSIGHT_PATH}/reports`} isPlatformAdmin={ctx.isPlatformAdmin} />}
      actions={
        ctx.isPlatformAdmin ? (
          <ReportActions
            orgId={ctx.org.id}
            periodStart={lastMonth}
            version={null}
            hasReport={hasLastMonth}
          />
        ) : undefined
      }
    >
      {periods.length === 0 ? (
        <EmptyState
          kind="empty"
          title="No reports yet"
          detail={
            ctx.isPlatformAdmin
              ? "Generate last month when you are ready. Nothing is emailed until you send it."
              : "This report will appear here when it is ready."
          }
        />
      ) : (
        <Panel>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Version</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map((row) => (
                <TableRow key={row.periodStart}>
                  <TableCell className="font-medium text-card-foreground">{row.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.latestVersion}</TableCell>
                  <TableCell className="text-silver">
                    {formatWhen(row.generatedAt, ctx.org.timezone)}
                    {row.generatedByName ? ` · ${row.generatedByName}` : ""}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`${FORSIGHT_PATH}/reports/${periodPath(row.periodStart)}`}
                      className="text-xs text-brand-300"
                    >
                      Open
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
    </PageFrame>
  );
}

function formatWhen(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
