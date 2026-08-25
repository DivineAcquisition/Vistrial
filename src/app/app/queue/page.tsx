import { PageFrame } from "@/components/app/page-frame";
import { QueueScreen } from "@/app/app/queue/queue-screen";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { loadRecentActivity } from "@/lib/activity/load";
import { loadVoiceProfile } from "@/lib/follow-up/load";
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
  const [payload, voice, recentActivity] = await Promise.all([
    loadOrgQueue(filters),
    loadVoiceProfile(ctx.org.id),
    canManageOrgSettings(ctx.role, ctx.isPlatformAdmin) ? loadRecentActivity() : Promise.resolve(null),
  ]);

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
        voiceExampleCount={voice.examples.length}
        recentActivity={recentActivity?.events ?? []}
        canViewActivity={canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)}
      />
    </PageFrame>
  );
}
