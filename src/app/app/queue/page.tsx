import { PageFrame } from "@/components/app/page-frame";
import { AddPersonDialog } from "@/app/app/cases/add-person-dialog";
import { QueueScreen } from "@/app/app/queue/queue-screen";
import { canCreateLeads, canManageOrgSettings } from "@/lib/auth/permissions";
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

  const canAdd = canCreateLeads(ctx.role, ctx.isPlatformAdmin);

  return (
    <PageFrame
      title="To call"
      description="People waiting to be contacted, in order."
      actions={canAdd ? <AddPersonDialog /> : undefined}
    >
      <QueueScreen
        key={queueFiltersHref(filters)}
        initial={payload}
        filters={filters}
        canOpenIntegrations={canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)}
        canCreateLeads={canCreateLeads(ctx.role, ctx.isPlatformAdmin)}
      />
    </PageFrame>
  );
}
