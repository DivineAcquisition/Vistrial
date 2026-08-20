import { PageFrame } from "@/components/app/page-frame";
import { CrmListPlaceholder } from "@/components/app/crm-list-placeholder";
import { throwIfForcedRouteError } from "@/lib/route-error";

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ forceError?: string }>;
}) {
  const params = await searchParams;
  throwIfForcedRouteError(params.forceError);

  return (
    <PageFrame
      title="Queue"
      description="Leads ready to work, once the CRM is connected and scoring is running."
    >
      <CrmListPlaceholder
        missing={{
          title: "The queue is empty until the CRM is connected",
          detail:
            "New leads will land here after GoHighLevel is linked and the scoring engine can rank them. Nothing is missing on your side yet — the connection has not been set up.",
        }}
        broken={{
          title: "The queue cannot load while the CRM connection is broken",
          detail:
            "GoHighLevel is linked but token refresh failed. Reconnect in Integrations. Showing an empty queue would hide this outage.",
        }}
        empty={{
          title: "The queue is empty",
          detail:
            "GoHighLevel is connected. There are no ranked leads to work yet. New contacts will appear here after they ingest and score.",
        }}
      />
    </PageFrame>
  );
}
