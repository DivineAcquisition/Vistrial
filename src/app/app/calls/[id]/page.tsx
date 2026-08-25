import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { CallDetailScreen } from "@/app/app/calls/call-detail-screen";
import { isLeadId } from "@/lib/cases/filters";
import { loadOrgCallDetail } from "@/lib/calls/load";
import { loadCallQualityForCall } from "@/lib/coaching/load";
import { throwIfForcedRouteError } from "@/lib/route-error";

export default async function CallDetailPage({
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
  const payload = await loadOrgCallDetail(id);
  if (!payload) notFound();
  const quality = await loadCallQualityForCall(id);

  return (
    <PageFrame
      title={payload.lead.name}
      description="What was said, structured. The transcript is the receipt."
      breadcrumbs={[
        { href: "/app/calls", label: "Calls" },
        { href: `/app/calls/${payload.call.id}`, label: payload.lead.name },
      ]}
    >
      <CallDetailScreen initial={payload} quality={quality} />
    </PageFrame>
  );
}
