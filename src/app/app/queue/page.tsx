import { PageFrame } from "@/components/app/page-frame";
import { QueueScreen } from "@/app/app/queue/queue-screen";
import { FirstWeekPanel, SetupNeededBanner } from "@/app/app/queue/first-week-panel";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { loadVoiceProfile } from "@/lib/follow-up/load";
import { loadFirstWeekHealth } from "@/lib/onboarding/week";
import { parseQueueFilters, queueFiltersHref } from "@/lib/queue/filters";
import { loadOrgQueue } from "@/lib/queue/load";
import { throwIfForcedRouteError } from "@/lib/route-error";
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
    isPlatformAdmin: ctx.isPlatformAdmin,
  });
  const canManage = canManageOrgSettings(ctx.role, ctx.isPlatformAdmin);
  const supabase = await createClient();
  const [payload, voice, orgRow, week] = await Promise.all([
    loadOrgQueue(filters),
    loadVoiceProfile(ctx.org.id),
    canManage
      ? supabase.from("organizations").select("activated_at").eq("id", ctx.org.id).maybeSingle()
      : Promise.resolve({ data: null }),
    canManage ? loadFirstWeekHealth(ctx.org.id) : Promise.resolve(null),
  ]);

  return (
    <PageFrame
      title="Queue"
      description="Who to contact next, and what you need to know before you do."
    >
      {canManage && !orgRow.data?.activated_at ? <SetupNeededBanner /> : null}
      {canManage && week?.activatedAt ? (
        <FirstWeekPanel health={week} now={new Date().toISOString()} />
      ) : null}
      <QueueScreen
        key={queueFiltersHref(filters)}
        initial={payload}
        filters={filters}
        canOpenIntegrations={canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)}
        voiceExampleCount={voice.examples.length}
      />
    </PageFrame>
  );
}
