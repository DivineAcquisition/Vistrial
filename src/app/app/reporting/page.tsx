import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { requireReportingAccess } from "@/lib/reporting/access";
import { loadReportingState } from "@/lib/reporting/load";
import { parseReportingRange } from "@/lib/reporting/range";
import { ReportingRangeForm } from "@/app/app/reporting/range-form";
import { ReportingLinks, ReportingPanels } from "@/app/app/reporting/panels";
import { btnSecondary, btnSizeSm, helperClass } from "@/lib/ui";
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
        description="The outcome metric waits until baseline history is pulled or skipped."
      >
        <Panel className="px-6 py-6">
          <p className="text-sm font-medium text-white">
            {crm === "active"
              ? "The CRM is connected. History is being pulled before this workspace is marked live."
              : "Reporting has nothing to measure yet."}
          </p>
          <p className={helperClass}>
            {backfill
              ? `Baseline backfill status: ${String(backfill.status)}. ${String((backfill.progress as { phase?: string } | undefined)?.phase ?? "")}`
              : "Connect the CRM to start the automatic baseline backfill."}
          </p>
          <div className="mt-4">
            <Link href="/app/settings/integrations" className={`${btnSecondary} ${btnSizeSm}`}>
              Open integrations
            </Link>
          </div>
        </Panel>
      </PageFrame>
    );
  }

  return (
    <PageFrame
      title="Reporting"
      description="Clients closed per hundred leads, and the operational numbers that explain it."
      actions={<ReportingLinks range={range} />}
    >
      {meta.job_stale === true ? (
        <Panel className="mb-6 border-flag-warning/40 px-6 py-4">
          <p className="text-sm text-flag-warning">
            The scheduled aggregation job looks stale
            {typeof meta.last_job_finished_at === "string"
              ? ` (last finished ${formatComputedAt(meta.last_job_finished_at)})`
              : ""}
            . Figures below are still computed from the database; they may not be the hourly cache.
          </p>
        </Panel>
      ) : null}
      <ReportingRangeForm range={range} action="/app/reporting" />
      <ReportingPanels orgId={ctx.org.id} range={range} includeTeam />
    </PageFrame>
  );
}
