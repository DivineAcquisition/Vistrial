import { notFound } from "next/navigation";
import { PageFrame } from "@/components/app/page-frame";
import { AddPersonDialog } from "@/app/(workspace)/app/cases/add-person-dialog";
import { ExperienceList } from "@/components/cases/experience-list";
import { canCreateLeads } from "@/lib/auth/permissions";
import { parseExperienceFilter } from "@/lib/cases/experience";
import { loadExperiencePage } from "@/lib/cases/experience-load";
import { createClient } from "@/lib/supabase/server";
import { throwIfForcedRouteError } from "@/lib/route-error";
import { requireSalesOs } from "@/lib/sales-os/guard";
import type { SupabaseClient } from "@supabase/supabase-js";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  throwIfForcedRouteError(params.forceError);
  const ctx = await requireSalesOs();
  if (ctx.workspaceRole === "member") notFound();
  let filter = parseExperienceFilter(params);
  const db = (await createClient()) as unknown as SupabaseClient;
  const savedId = typeof params.saved === "string" ? params.saved : null;
  const [{ data: savedRows }, { data: prefs }] = await Promise.all([
    db.from("lead_saved_views").select("id, name, shared, filters").eq("org_id", ctx.org.id),
    db.from("user_preferences").select("list_density").eq("user_id", ctx.user.id).maybeSingle(),
  ]);
  const saved = (savedRows ?? []) as Array<{ id: string; name: string; shared: boolean; filters: unknown }>;
  if (savedId) {
    const match = saved.find((view) => view.id === savedId);
    if (match && match.filters && typeof match.filters === "object") {
      filter = { ...filter, ...(match.filters as object) };
    }
  }
  const page = await loadExperiencePage(filter);
  const canAdd = canCreateLeads(ctx.role, ctx.isStaff);
  const canExport = ctx.isStaff || ctx.workspaceRole === "owner" || ctx.isPlatformAdmin;
  const density = prefs && (prefs as { list_density?: string }).list_density === "dense" ? "dense" : "comfortable";

  return (
    <PageFrame
      title={ctx.workspaceRole === "operator" ? "My leads" : "Leads"}
      description="Who they are, how ready they are, and what to do next."
      actions={canAdd ? <AddPersonDialog /> : undefined}
    >
      <ExperienceList
        key={JSON.stringify(filter)}
        filter={filter}
        rows={page.rows}
        hasMore={page.hasMore}
        settings={page.settings}
        counts={page.counts}
        sources={page.sources}
        savedViews={saved.map(({ id, name, shared }) => ({ id, name, shared }))}
        density={density}
        canExport={canExport}
        canBulk={canExport}
        memberId={ctx.member.id}
        orgId={ctx.org.id}
        basePath="/app/leads"
      />
    </PageFrame>
  );
}
