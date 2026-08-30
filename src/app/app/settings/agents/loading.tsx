import { PageFrame } from "@/components/app/page-frame";
import { Spinner } from "@/components/ui/spinner";
import { advancedSettingsBreadcrumbs } from "@/lib/navigation";

export default function AgentsSettingsLoading() {
  return (
    <PageFrame
      title="Agents"
      description="Who may run on a schedule, what they may change, and the stop switch."
      breadcrumbs={advancedSettingsBreadcrumbs("Agents", "/app/settings/agents")}
    >
      <Spinner />
    </PageFrame>
  );
}
