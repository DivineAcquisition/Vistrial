import { PageFrame } from "@/components/app/page-frame";
import { QueueScreen } from "@/app/app/queue/queue-screen";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { loadRecentActivity } from "@/lib/activity/load";
import { isProductScopeEnabled } from "@/lib/product-scope";
import { loadVoiceProfile } from "@/lib/follow-up/load";
import { parseQueueFilters, queueFiltersHref } from "@/lib/queue/filters";
import { loadOrgQueue } from "@/lib/queue/load";
import { DEFAULT_READY_THRESHOLD, loadScoreConfig } from "@/lib/scoring/store";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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
  const canViewActivity =
    isProductScopeEnabled("activityStream") && canManageOrgSettings(ctx.role, ctx.isPlatformAdmin);
  const [payload, voice, recentActivity, scoreConfig] = await Promise.all([
    loadOrgQueue(filters),
    loadVoiceProfile(ctx.org.id),
    canViewActivity ? loadRecentActivity() : Promise.resolve(null),
    // A workspace mid-setup has no scoring config yet. The queue still has to
    // render, so fall back to the same threshold the migration seeds.
    loadScoreConfig(getSupabaseAdmin(), ctx.org.id).catch(() => null),
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
        readyThreshold={scoreConfig?.readyThreshold ?? DEFAULT_READY_THRESHOLD}
        recentActivity={recentActivity?.events ?? []}
        canViewActivity={canViewActivity}
      />
    </PageFrame>
  );
}
