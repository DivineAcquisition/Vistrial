import { redirect } from "next/navigation";

import { ForsightPage } from "@/app/(workspace)/app/forsight/forsight-chrome";
import { WeeklyPulseScreen } from "@/app/(workspace)/app/forsight/weekly-pulse";
import { loadLiveSources, loadWeeklyPulse } from "@/lib/forsight/dashboard";
import { FORSIGHT_PATH } from "@/lib/navigation";
import { isProductScopeEnabled } from "@/lib/product-scope";
import { requireReportingAccess } from "@/lib/reporting/access";

export const dynamic = "force-dynamic";

export const metadata = { title: "Forsight" };

export default async function WeeklyPulsePage() {
  const ctx = await requireReportingAccess();
  if (!isProductScopeEnabled("forsightWeeklyPulse")) {
    redirect(`${FORSIGHT_PATH}/pipeline`);
  }
  const view = await loadWeeklyPulse();
  // Loaded after the pulse so the live sources see the same week the pulse is
  // reporting on. Neither can fail this page.
  const live = await loadLiveSources(view.state === "ok" ? view.data.current : null);

  return (
    <ForsightPage
      activeHref={FORSIGHT_PATH}
      title="Weekly Pulse"
      description="How the funnel is doing right now, and which direction it is moving."
      view={view}
      isStaff={ctx.isStaff}
    >
      {(pulse) => <WeeklyPulseScreen pulse={pulse} live={live} />}
    </ForsightPage>
  );
}
