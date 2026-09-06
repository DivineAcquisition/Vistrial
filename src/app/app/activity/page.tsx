import { PageFrame } from "@/components/app/page-frame";
import { ActivityScreen } from "@/app/app/activity/activity-screen";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { parseActivityFilters, activityFiltersHref } from "@/lib/activity/filters";
import { loadActivityActors, loadOrgActivity } from "@/lib/activity/load";
import { assertProductScope } from "@/lib/product-scope-guard";

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  assertProductScope("activityStream");
  await requireOrgSettingsManager();
  const params = await searchParams;
  const filters = parseActivityFilters(params);
  const [initial, actors] = await Promise.all([loadOrgActivity(filters), loadActivityActors()]);

  return (
    <PageFrame
      title="Activity"
      description="Everything Vistrial is doing, in plain language, as it happens. This is not a notification and it never shows what a prospect wrote."
    >
      <ActivityScreen
        key={activityFiltersHref(filters)}
        initial={initial}
        filters={filters}
        actors={actors}
      />
    </PageFrame>
  );
}
