import { PageFrame } from "@/components/app/page-frame";
import { OrganizationForm } from "@/app/app/settings/organization/organization-form";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { createClient } from "@/lib/supabase/server";

export default async function OrganizationSettingsPage() {
  const { org } = await requireOrgSettingsManager();
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("working_hours_start, working_hours_end, working_days")
    .eq("id", org.id)
    .maybeSingle();

  return (
    <PageFrame
      title="Workspace"
      description="Name, timezone, and working hours. Scoring, follow-up, and the CRM live under Advanced."
    >
      <OrganizationForm
        name={org.name}
        timezone={org.timezone}
        ghlLocationId={org.ghlLocationId}
        salesCycleDays={60}
        baselineLookbackDays={365}
        workingHoursStart={data?.working_hours_start?.slice(0, 5) ?? "08:00"}
        workingHoursEnd={data?.working_hours_end?.slice(0, 5) ?? "18:00"}
        workingDays={data?.working_days ?? [1, 2, 3, 4, 5]}
        transcriptRetentionDays={365}
        callCoachingEmbargoHours={48}
        operatorAgentBatchCap={10}
        surface="workspace"
      />
    </PageFrame>
  );
}
