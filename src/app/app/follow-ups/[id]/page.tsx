import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { FollowUpReviewScreen } from "@/app/app/follow-ups/follow-up-review-screen";
import { isLeadId } from "@/lib/cases/filters";
import { loadFollowUpReview } from "@/lib/follow-up/load";
import { throwIfForcedRouteError } from "@/lib/route-error";

export default async function FollowUpReviewPage({
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
  const payload = await loadFollowUpReview(id);
  if (!payload) notFound();

  return (
    <PageFrame
      title="Follow-up draft"
      description="Vistrial drafts. You approve. The CRM sends."
      breadcrumbs={[
        { href: "/app/queue", label: "To call" },
        { href: `/app/follow-ups/${payload.draft.id}`, label: payload.lead.name },
      ]}
    >
      <FollowUpReviewScreen initial={payload} />
    </PageFrame>
  );
}
