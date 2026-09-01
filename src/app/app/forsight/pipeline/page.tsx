import { ForsightPage } from "@/app/app/forsight/forsight-chrome";
import { PipelineScreen } from "@/app/app/forsight/pipeline/pipeline-screen";
import { loadPipelineHealth } from "@/lib/forsight/dashboard";
import { FORSIGHT_PATH } from "@/lib/navigation";
import { requireReportingAccess } from "@/lib/reporting/access";

export const dynamic = "force-dynamic";

export const metadata = { title: "Pipeline Health · Forsight" };

export default async function PipelineHealthPage() {
  const ctx = await requireReportingAccess();
  const view = await loadPipelineHealth();
  const now = new Date();

  return (
    <ForsightPage
      activeHref={`${FORSIGHT_PATH}/pipeline`}
      title="Pipeline Health"
      description="Whether anything is slipping that a person needs to act on today. Each lead carries the Next Action Airtable already wrote for it."
      view={view}
      isPlatformAdmin={ctx.isPlatformAdmin}
    >
      {(health) => <PipelineScreen health={health} now={now} />}
    </ForsightPage>
  );
}
