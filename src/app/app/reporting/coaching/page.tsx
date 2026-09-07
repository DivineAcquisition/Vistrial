import { PageFrame } from "@/components/app/page-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { ReportingTabs } from "@/app/app/reporting/panels";
import { CoachingManagerView } from "@/app/app/reporting/coaching/view";
import { requireReportingAccess } from "@/lib/reporting/access";
import { loadReportingState } from "@/lib/reporting/load";
import { loadCallQualityManagerSnapshot } from "@/lib/coaching/load";
import { parseReportingRange } from "@/lib/reporting/range";
import { assertProductScope } from "@/lib/product-scope-guard";

export default async function CoachingReportingPage() {
  assertProductScope("coaching");
  const ctx = await requireReportingAccess();
  const meta = await loadReportingState(ctx.org.id);
  const activatedAt = typeof meta.activated_at === "string" ? meta.activated_at : null;
  const payload = await loadCallQualityManagerSnapshot(ctx.org.id);

  if (!activatedAt) {
    return (
      <PageFrame
        title="Coaching"
        description="Team patterns for a coaching conversation, not a performance file."
      >
        <EmptyState
          kind="unconfigured"
          title="Nothing to coach on until this workspace is live."
          detail="Call-quality patterns wait for transcribed calls whose outcomes have had time to resolve."
        />
      </PageFrame>
    );
  }

  return (
    <PageFrame
      title="Coaching"
      description="What the team as a whole is missing, then people to review with — never a ranking."
      toolbar={
        <ReportingTabs
          range={parseReportingRange({}, activatedAt)}
          activeHref="/app/reporting/coaching"
        />
      }
    >
      <CoachingManagerView payload={payload} />
    </PageFrame>
  );
}
