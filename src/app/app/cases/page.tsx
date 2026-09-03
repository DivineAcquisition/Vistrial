import { PageFrame } from "@/components/app/page-frame";
import { CasesScreen } from "@/app/app/cases/cases-screen";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { caseFiltersHref, parseCaseListFilters } from "@/lib/cases/filters";
import { loadOrgCaseList } from "@/lib/cases/load";
import { throwIfForcedRouteError } from "@/lib/route-error";

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  throwIfForcedRouteError(params.forceError);

  const ctx = await getAuthContext();
  const filters = parseCaseListFilters(params);
  const payload = await loadOrgCaseList(filters);

  return (
    <PageFrame
        title="People"
        description="Find anyone in this workspace, not only who to call next."
    >
      <CasesScreen
        key={caseFiltersHref(filters)}
        initial={payload}
        filters={filters}
        canOpenIntegrations={canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)}
      />
    </PageFrame>
  );
}
