import { PageFrame } from "@/components/app/page-frame";
import { AddPersonDialog } from "@/app/app/cases/add-person-dialog";
import { CasesScreen } from "@/app/app/cases/cases-screen";
import { canCreateLeads, canManageOrgSettings } from "@/lib/auth/permissions";
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

  const canAdd = canCreateLeads(ctx.role, ctx.isPlatformAdmin);

  return (
    <PageFrame
      title="People"
      description="Everyone in this workspace. Vistrial stores them here."
      actions={canAdd ? <AddPersonDialog /> : undefined}
    >
      <CasesScreen
        key={caseFiltersHref(filters)}
        initial={payload}
        filters={filters}
        canOpenIntegrations={canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)}
        canCreateLeads={canCreateLeads(ctx.role, ctx.isPlatformAdmin)}
      />
    </PageFrame>
  );
}
