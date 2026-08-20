import { PageFrame } from "@/components/app/page-frame";
import { UnconfiguredState } from "@/components/app/unconfigured-state";
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
      <UnconfiguredState
        withIntegrationsLink
        title="The queue is empty until the CRM is connected"
        detail="New leads will land here after GoHighLevel is linked and the scoring engine can rank them. Nothing is missing on your side yet — the connection has not been set up."
      />
    </PageFrame>
  );
}
