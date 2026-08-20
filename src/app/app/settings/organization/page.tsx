import { PageFrame } from "@/components/app/page-frame";
import { OrganizationForm } from "@/app/app/settings/organization/organization-form";
import { requireOrgSettingsManager } from "@/lib/auth/gates";

export default async function OrganizationSettingsPage() {
  const { org } = await requireOrgSettingsManager();

  return (
    <PageFrame
      title="Organization"
      description="Workspace name, timezone, and the CRM location this org is tied to."
    >
      <OrganizationForm
        name={org.name}
        timezone={org.timezone}
        ghlLocationId={org.ghlLocationId}
      />
    </PageFrame>
  );
}
