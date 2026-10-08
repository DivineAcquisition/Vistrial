import { EmptyPageSkeleton } from "@/components/app/page-skeletons";

export default function IntegrationsSettingsLoading() {
  return (
    <EmptyPageSkeleton
      title="Integrations"
      description="The CRM connection for this workspace."
    />
  );
}
