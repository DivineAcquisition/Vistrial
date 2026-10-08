import { PageFrame } from "@/components/app/page-frame";
import { PageLoader } from "@/components/app/page-loader";
import { advancedSettingsBreadcrumbs } from "@/lib/navigation";

export default function AgentsSettingsLoading() {
  return (
    <PageFrame
      title="Agents"
      description="Who may run on a schedule, what they may change, and the stop switch."
      breadcrumbs={advancedSettingsBreadcrumbs("Agents", "/app/settings/agents")}
    >
      <PageLoader />
    </PageFrame>
  );
}
