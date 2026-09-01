import { CreativeTable } from "@/app/app/forsight/creatives/creative-table";
import { ForsightPage } from "@/app/app/forsight/forsight-chrome";
import { loadCreativePerformance } from "@/lib/forsight/dashboard";
import { FORSIGHT_PATH } from "@/lib/navigation";
import { requireReportingAccess } from "@/lib/reporting/access";

export const dynamic = "force-dynamic";

export const metadata = { title: "Creative Performance · Forsight" };

export default async function CreativePerformancePage() {
  const ctx = await requireReportingAccess();
  const view = await loadCreativePerformance();

  return (
    <ForsightPage
      activeHref={`${FORSIGHT_PATH}/creatives`}
      title="Creative Performance"
      description="Which ads are earning their spend and which should be killed."
      view={view}
      isPlatformAdmin={ctx.isPlatformAdmin}
    >
      {(rows) => <CreativeTable rows={rows} />}
    </ForsightPage>
  );
}
