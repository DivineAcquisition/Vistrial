import { PageFrame } from "@/components/app/page-frame";
import { UnconfiguredState } from "@/components/app/unconfigured-state";
import { requireOrgSettingsManager } from "@/lib/auth/gates";

export default async function IntegrationsSettingsPage() {
  await requireOrgSettingsManager();

  return (
    <PageFrame
      title="Integrations"
      description="The CRM connection for this workspace."
    >
      <UnconfiguredState
        title="The CRM is not connected yet"
        detail="GoHighLevel will be linked from this page. Until that connection flow exists, this workspace has nothing to sync — leads, calls, and reporting stay empty for that reason."
      />
    </PageFrame>
  );
}
