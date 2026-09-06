import { PageFrame } from "@/components/app/page-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { requireReportingAccess } from "@/lib/reporting/access";
import { loadReportingState } from "@/lib/reporting/load";
import { ReportingTabs } from "@/app/app/reporting/panels";
import { CalibrationReport } from "@/app/app/reporting/calibration/report";
import { parseReportingRange } from "@/lib/reporting/range";
import { assertProductScope } from "@/lib/product-scope-guard";

export default async function CalibrationPage() {
  assertProductScope("extraReporting");
  const ctx = await requireReportingAccess();
  const meta = await loadReportingState(ctx.org.id);
  const activatedAt = typeof meta.activated_at === "string" ? meta.activated_at : null;

  if (!activatedAt) {
    return (
      <PageFrame
        title="How scoring is doing"
        description="Whether higher-scoring leads actually close more, in this business."
      >
        <EmptyState
          kind="unconfigured"
          title="Nothing to measure until this workspace is live."
          detail="This view waits until enough people have closed. Going live starts that clock."
        />
      </PageFrame>
    );
  }

  return (
    <PageFrame
      title="How scoring is doing"
      description="Whether the score matches who actually closes, and which parts of the process are earning their keep."
      toolbar={
        <ReportingTabs
          range={parseReportingRange({}, activatedAt)}
          activeHref="/app/reporting/calibration"
        />
      }
    >
      <CalibrationReport orgId={ctx.org.id} isPlatformAdmin={ctx.isPlatformAdmin} />
    </PageFrame>
  );
}
