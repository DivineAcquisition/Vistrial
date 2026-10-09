import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { CaseFileScreen } from "@/app/(workspace)/app/cases/[id]/case-file-screen";
import { HandoffPipeline, LeadLiveIndicator } from "@/components/live/handoff-pipeline";
import { ScribeCaseFile } from "@/components/live/scribe-case-file";
import { loadLeadPipeline } from "@/lib/live/load";
import { loadPrecallBrief } from "@/lib/brief/load";
import { isLeadId } from "@/lib/cases/filters";
import { loadOrgCaseFile } from "@/lib/cases/load";
import { loadScribeCaseFile } from "@/lib/scribe/case-file";
import { DEFAULT_READY_THRESHOLD, loadScoreConfig } from "@/lib/scoring/store";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { throwIfForcedRouteError } from "@/lib/route-error";

export default async function CaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  throwIfForcedRouteError(query.forceError);

  if (!isLeadId(id)) notFound();
  const [payload, brief] = await Promise.all([loadOrgCaseFile(id), loadPrecallBrief(id)]);
  if (!payload) notFound();
  const [scoreConfig, pipeline, scribeFile] = await Promise.all([
    loadScoreConfig(getSupabaseAdmin(), payload.lead.orgId).catch(() => null),
    loadLeadPipeline(payload.lead.orgId, payload.lead.id).catch(() => ({ runs: [], waiting: [] })),
    loadScribeCaseFile(payload.lead.orgId, payload.lead.id).catch(() => null),
  ]);

  return (
    <PageFrame
      title={payload.lead.name}
      description="Who this is, what they have already said, and what was agreed."
      breadcrumbs={[
        { href: "/app/cases", label: "People" },
        { href: `/app/cases/${payload.lead.id}`, label: payload.lead.name },
      ]}
    >
      <div className="mb-6 space-y-2">
        <LeadLiveIndicator leadId={payload.lead.id} />
        <HandoffPipeline leadId={payload.lead.id} initialRuns={pipeline.runs} initialWaiting={pipeline.waiting} />
      </div>
      <ScribeCaseFile leadId={payload.lead.id} initial={scribeFile} />
      <CaseFileScreen
        initial={payload}
        brief={brief}
        readyThreshold={scoreConfig?.readyThreshold ?? DEFAULT_READY_THRESHOLD}
      />
    </PageFrame>
  );
}
