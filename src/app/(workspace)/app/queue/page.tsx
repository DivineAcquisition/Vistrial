import { PageFrame } from "@/components/app/page-frame";
import { AddPersonDialog } from "@/app/(workspace)/app/cases/add-person-dialog";
import { QueueScreen } from "@/app/(workspace)/app/queue/queue-screen";
import { canCreateLeads, canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { parseQueueFilters, queueFiltersHref } from "@/lib/queue/filters";
import { loadOrgQueue } from "@/lib/queue/load";
import { throwIfForcedRouteError } from "@/lib/route-error";
import { setQueueOrderForm } from "@/app/(workspace)/app/settings/assay/actions";
import { canSeeTranscripts } from "@/lib/transcripts/access";
import { createClient } from "@/lib/supabase/server";

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
    isStaff: ctx.isStaff,
  });
  const payload = await loadOrgQueue(filters);
  const transcripts = await canSeeTranscripts(await createClient(), ctx.org.id);

  const canAdd = canCreateLeads(ctx.role, ctx.isStaff);

  return (
    <PageFrame
      title="To call"
      description="People waiting to be contacted, in order."
      actions={canAdd ? <AddPersonDialog /> : undefined}
    >
      <form action={setQueueOrderForm} className="mb-4 flex gap-2 text-sm">
        <button className="rounded-md border border-border px-3 py-2" name="mode" value="best" type="submit">Best first</button>
        <button className="rounded-md border border-border px-3 py-2" name="mode" value="oldest" type="submit">Oldest first</button>
      </form>
      <QueueScreen
        key={queueFiltersHref(filters)}
        initial={payload}
        filters={filters}
        canOpenIntegrations={canManageOrgSettings(ctx.role, ctx.isStaff)}
        canCreateLeads={canCreateLeads(ctx.role, ctx.isStaff)}
        canSeeCall={transcripts}
      />
    </PageFrame>
  );
}
