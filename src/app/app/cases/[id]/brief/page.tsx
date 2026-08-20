import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { BriefScreen } from "@/app/app/cases/[id]/brief/brief-screen";
import { loadPrecallBrief } from "@/lib/brief/load";
import { isLeadId } from "@/lib/cases/filters";
import { throwIfForcedRouteError } from "@/lib/route-error";

export default async function PrecallBriefPage({
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

  const brief = await loadPrecallBrief(id);
  if (!brief) notFound();

  return (
    <PageFrame
      title={`Brief · ${brief.lead.name}`}
      description="Everything known, readable in ninety seconds."
      breadcrumbs={[
        { href: "/app/cases", label: "Case Files" },
        { href: `/app/cases/${brief.lead.id}`, label: brief.lead.name },
        { href: `/app/cases/${brief.lead.id}/brief`, label: "Brief" },
      ]}
    >
      <BriefScreen brief={brief} />
    </PageFrame>
  );
}
