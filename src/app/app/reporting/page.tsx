import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/states";
import { requireReportingAccess } from "@/lib/reporting/access";
import { loadReportingState } from "@/lib/reporting/load";
import { parseReportingRange, reportingViewHref } from "@/lib/reporting/range";
import { ReportingRangeForm } from "@/app/app/reporting/range-form";
import { ReportingExports, ReportingPanels, ReportingTabs } from "@/app/app/reporting/panels";
import { formatComputedAt } from "@/lib/reporting/format";

export default async function ReportingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireReportingAccess();
  const params = await searchParams;
  const meta = await loadReportingState(ctx.org.id);
  const activatedAt = typeof meta.activated_at === "string" ? meta.activated_at : null;
  const range = parseReportingRange(params, activatedAt);
  const backfill = meta.backfill && typeof meta.backfill === "object" ? (meta.backfill as Record<string, unknown>) : null;
  const crm = typeof meta.crm_connected === "string" ? meta.crm_connected : "missing";

  if (!activatedAt) {
    return (
      <PageFrame
        title="Reporting"
        description="Time to first touch, leads with no human touch, bookings, and show rate."
      >
        <EmptyState
          kind="unconfigured"
          title={
            crm === "active"
              ? "The CRM is connected. Nothing is measured until the workspace goes live."
              : "Reporting has nothing to measure yet."
          }
          detail={`${
            backfill
              ? `History import status: ${String(backfill.status)}. ${String(
                  (backfill.progress as { phase?: string } | undefined)?.phase ?? ""
                )}`
              : "Connect the CRM so we can read your past history."
          } Going live is a separate step.`}
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/app/settings/business-profile">Open business settings</Link>
            </Button>
          }
        />
      </PageFrame>
    );
  }

  return (
    <PageFrame
      title="Reporting"
      description="Time to first touch, leads with no human touch, bookings, and show rate."
      actions={<ReportingExports range={range} />}
      toolbar={<ReportingTabs range={range} activeHref={reportingViewHref("/app/reporting", range)} />}
    >
      {meta.job_stale === true ? (
        <Notice tone="warning" className="mb-6">
          These numbers may be a few hours behind
          {typeof meta.last_job_finished_at === "string"
            ? ` (last updated ${formatComputedAt(meta.last_job_finished_at)})`
            : ""}
          . The figures below are still current from the database.
        </Notice>
      ) : null}
      <ReportingRangeForm range={range} action="/app/reporting" />
      <ReportingPanels
        orgId={ctx.org.id}
        range={range}
        includeTeam
        includeIngestion={ctx.isPlatformAdmin}
      />
    </PageFrame>
  );
}
