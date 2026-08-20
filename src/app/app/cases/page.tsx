import { PageFrame } from "@/components/app/page-frame";
import { UnconfiguredState } from "@/components/app/unconfigured-state";

export default function CasesPage() {
  return (
    <PageFrame
      title="Case Files"
      description="Every lead's persistent record, once contacts sync from the CRM."
    >
      <UnconfiguredState
        withIntegrationsLink
        title="Case files appear after the CRM is connected"
        detail="Each inbound lead will get a case file here. That list stays empty until GoHighLevel sync is turned on."
      />
    </PageFrame>
  );
}
