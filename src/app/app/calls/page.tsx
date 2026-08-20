import { PageFrame } from "@/components/app/page-frame";
import { UnconfiguredState } from "@/components/app/unconfigured-state";

export default function CallsPage() {
  return (
    <PageFrame
      title="Calls"
      description="Recorded conversations and transcripts, once call capture is connected."
    >
      <UnconfiguredState
        withIntegrationsLink
        title="Calls appear after capture is connected"
        detail="Booked and completed calls will list here once the CRM and transcript sources are linked. There is nothing to work yet because those connections are not in place."
      />
    </PageFrame>
  );
}
