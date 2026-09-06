import { redirect } from "next/navigation";

import { ForsightPage } from "@/app/app/forsight/forsight-chrome";
import { WeeklyPulseScreen } from "@/app/app/forsight/weekly-pulse";
import { loadWeeklyPulse } from "@/lib/forsight/dashboard";
import { FORSIGHT_PATH } from "@/lib/navigation";
import { PRODUCT_SCOPE } from "@/lib/product-scope";
import { requireReportingAccess } from "@/lib/reporting/access";

export const dynamic = "force-dynamic";

export const metadata = { title: "Forsight" };

export default async function WeeklyPulsePage() {
  if (!PRODUCT_SCOPE.forsightWeeklyPulse) {
    redirect(`${FORSIGHT_PATH}/pipeline`);
  }
  await requireReportingAccess();
  const view = await loadWeeklyPulse();

  return (
    <ForsightPage
      activeHref={FORSIGHT_PATH}
      title="Weekly Pulse"
      description="How the funnel is doing right now, and which direction it is moving. Every figure is read from Airtable, which is where it is calculated."
      view={view}
    >
      {(pulse) => <WeeklyPulseScreen pulse={pulse} />}
    </ForsightPage>
  );
}
