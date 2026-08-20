import { PageFrame } from "@/components/app/page-frame";
import { CrmListPlaceholder } from "@/components/app/crm-list-placeholder";

export default function CallsPage() {
  return (
    <PageFrame
      title="Calls"
      description="Recorded conversations and transcripts, once call capture is connected."
    >
      <CrmListPlaceholder
        missing={{
          title: "Calls appear after capture is connected",
          detail:
            "Booked and completed calls will list here once the CRM and transcript sources are linked. There is nothing to work yet because those connections are not in place.",
        }}
        broken={{
          title: "Calls cannot load while the CRM connection is broken",
          detail:
            "Appointments will not sync until GoHighLevel is reconnected. This is not an empty call list.",
        }}
        empty={{
          title: "No calls yet",
          detail:
            "GoHighLevel is connected. Booked appointments will list here after they ingest. There is nothing to open yet.",
        }}
      />
    </PageFrame>
  );
}
