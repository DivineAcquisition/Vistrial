import { PageFrame } from "@/components/app/page-frame";
import { CrmListPlaceholder } from "@/components/app/crm-list-placeholder";

export default function CasesPage() {
  return (
    <PageFrame
      title="Case Files"
      description="Every lead's persistent record, once contacts sync from the CRM."
    >
      <CrmListPlaceholder
        missing={{
          title: "Case files appear after the CRM is connected",
          detail:
            "Each inbound lead will get a case file here. That list stays empty until GoHighLevel sync is turned on.",
        }}
        broken={{
          title: "Case files cannot load while the CRM connection is broken",
          detail:
            "The location is linked but the connection is broken. Reconnect in Integrations. This is not an empty caseload.",
        }}
        empty={{
          title: "No case files yet",
          detail:
            "GoHighLevel is connected. Contacts will appear here after they ingest. There is nothing to open yet.",
        }}
      />
    </PageFrame>
  );
}
