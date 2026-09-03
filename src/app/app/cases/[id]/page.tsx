import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { CaseFileScreen } from "@/app/app/cases/[id]/case-file-screen";
import { loadPrecallBrief } from "@/lib/brief/load";
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
  const [payload, brief] = await Promise.all([loadOrgCaseFile(id), loadPrecallBrief(id)]);
  if (!payload) notFound();

  return (
    <PageFrame
      title={payload.lead.name}
      description="Who this is, what they have already said, and what was agreed."
      breadcrumbs={[
        { href: "/app/cases", label: "People" },
        { href: `/app/cases/${payload.lead.id}`, label: payload.lead.name },
      ]}
    >
      <CaseFileScreen initial={payload} brief={brief} />
    </PageFrame>
  );
}
