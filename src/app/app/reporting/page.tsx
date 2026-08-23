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
  const capacity =
    meta.capacity && typeof meta.capacity === "object" && !Array.isArray(meta.capacity)
      ? (meta.capacity as Record<string, unknown>)
      : null;
  const teamCoverageWarning =
    typeof capacity?.team_coverage_warning === "string" ? capacity.team_coverage_warning : null;
  const capacityWarning = typeof capacity?.capacity_warning === "string" ? capacity.capacity_warning : null;

  if (!activatedAt) {
    return (
      <PageFrame
        title="Reporting"
        description="The outcome metric waits until this workspace goes live."
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
              ? `Baseline backfill status: ${String(backfill.status)}. ${String(
                  (backfill.progress as { phase?: string } | undefined)?.phase ?? ""
                )}`
              : "Connect the CRM to start the automatic baseline backfill."
          } Activation is a deliberate step with its own gate.`}
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/app/settings/business-profile">Open the activation gate</Link>
            </Button>
          }
        />
      </PageFrame>
    );
  }

  return (
    <PageFrame
      title="Reporting"
      description="Clients closed per hundred leads, and the operational numbers that explain it."
      actions={<ReportingExports range={range} />}
      toolbar={<ReportingTabs range={range} activeHref={reportingViewHref("/app/reporting", range)} />}
    >
      {meta.job_stale === true ? (
        <Notice tone="warning" className="mb-6">
          The scheduled aggregation job looks stale
          {typeof meta.last_job_finished_at === "string"
            ? ` (last finished ${formatComputedAt(meta.last_job_finished_at)})`
            : ""}
          . Figures below are still computed from the database; they may not be the hourly cache.
        </Notice>
      ) : null}
      {teamCoverageWarning ? (
        <Notice tone="warning" className="mb-6" title="Team coverage">
          {teamCoverageWarning}
        </Notice>
      ) : null}
      {capacityWarning ? (
        <Notice tone="warning" className="mb-6" title="Lead volume">
          {capacityWarning}
        </Notice>
      ) : null}
      <ReportingRangeForm range={range} action="/app/reporting" />
      <ReportingPanels orgId={ctx.org.id} range={range} includeTeam />
    </PageFrame>
  );
}
