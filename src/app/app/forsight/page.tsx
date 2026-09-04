import { ForsightPage } from "@/app/app/forsight/forsight-chrome";
import { WeeklyPulseScreen } from "@/app/app/forsight/weekly-pulse";
import { loadLiveSources, loadWeeklyPulse } from "@/lib/forsight/dashboard";
import { FORSIGHT_PATH } from "@/lib/navigation";
import { requireReportingAccess } from "@/lib/reporting/access";

export const dynamic = "force-dynamic";

export const metadata = { title: "Forsight" };

export default async function WeeklyPulsePage() {
  const ctx = await requireReportingAccess();
  const view = await loadWeeklyPulse();
  // Loaded after the Airtable view so the live sources see the same week
  // Airtable is reporting on. Neither can fail this page.
  const live = await loadLiveSources(view.state === "ok" ? view.data.current : null);

  return (
    <ForsightPage
      activeHref={FORSIGHT_PATH}
      title="Weekly Pulse"
      description="How the funnel is doing right now, and which direction it is moving."
      view={view}
      isPlatformAdmin={ctx.isPlatformAdmin}
    >
      {(pulse) => <WeeklyPulseScreen pulse={pulse} live={live} />}
    </ForsightPage>
  );
}
