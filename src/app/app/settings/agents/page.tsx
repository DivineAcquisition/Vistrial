import { AgentsSettingsForm } from "@/app/app/settings/agents/agents-settings";
import { PageFrame } from "@/components/app/page-frame";
import { requirePlatformAdmin } from "@/lib/auth/gates";
import { loadAgentSettingsView } from "@/lib/agents/settings";
import { advancedSettingsBreadcrumbs } from "@/lib/navigation";

export default async function AgentsSettingsPage() {
  const { org } = await requirePlatformAdmin();
  const view = await loadAgentSettingsView(org.id);

  return (
    <PageFrame
      title="Agents"
      description="Who may run on a schedule, what they may change, and the stop switch."
      breadcrumbs={advancedSettingsBreadcrumbs("Agents", "/app/settings/agents")}
    >
      <AgentsSettingsForm view={view} />
    </PageFrame>
  );
}
