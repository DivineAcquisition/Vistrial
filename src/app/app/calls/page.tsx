import { PageFrame } from "@/components/app/page-frame";
import { CallsScreen } from "@/app/app/calls/calls-screen";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { loadOrgCallList } from "@/lib/calls/load";
import { throwIfForcedRouteError } from "@/lib/route-error";

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  throwIfForcedRouteError(params.forceError);
  const ctx = await getAuthContext();
  const payload = await loadOrgCallList();

  return (
    <PageFrame title="Calls" description="Recorded conversations and what was said.">
      <CallsScreen
        initial={payload}
        canOpenIntegrations={canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)}
      />
    </PageFrame>
  );
}
