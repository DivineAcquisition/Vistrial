import { PageFrame } from "@/components/app/page-frame";
import { QueueScreen } from "@/app/app/queue/queue-screen";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { parseQueueFilters, queueFiltersHref } from "@/lib/queue/filters";
import { loadOrgQueue } from "@/lib/queue/load";
import { throwIfForcedRouteError } from "@/lib/route-error";

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  throwIfForcedRouteError(params.forceError);

  const ctx = await getAuthContext();
  const filters = parseQueueFilters(params, {
    role: ctx.role,
    isPlatformAdmin: ctx.isPlatformAdmin,
  });
  const payload = await loadOrgQueue(filters);

  return (
    <PageFrame
      title="Queue"
      description="Who to contact next, and what you need to know before you do."
    >
      <QueueScreen
        key={queueFiltersHref(filters)}
        initial={payload}
        filters={filters}
        canOpenIntegrations={canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)}
      />
    </PageFrame>
  );
}
