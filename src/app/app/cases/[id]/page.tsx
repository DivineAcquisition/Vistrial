import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { CaseFileScreen } from "@/app/app/cases/[id]/case-file-screen";
import { isLeadId } from "@/lib/cases/filters";
import { loadOrgCaseFile } from "@/lib/cases/load";
import { throwIfForcedRouteError } from "@/lib/route-error";

export default async function CaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  throwIfForcedRouteError(query.forceError);

  if (!isLeadId(id)) notFound();
  const payload = await loadOrgCaseFile(id);
  if (!payload) notFound();

  return (
    <PageFrame
      title={payload.lead.name}
      description="Everything known about this person before you open your mouth."
      breadcrumbs={[
        { href: "/app/cases", label: "Case Files" },
        { href: `/app/cases/${payload.lead.id}`, label: payload.lead.name },
      ]}
    >
      <CaseFileScreen initial={payload} />
    </PageFrame>
  );
}
