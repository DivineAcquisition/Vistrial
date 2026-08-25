import { PageFrame } from "@/components/app/page-frame";
import { OrganizationForm, FollowUpOnboardingNote } from "@/app/app/settings/organization/organization-form";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { createClient } from "@/lib/supabase/server";

export default async function OrganizationSettingsPage() {
  const { org, isPlatformAdmin } = await requireOrgSettingsManager();
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("sales_cycle_days, baseline_lookback_days, working_hours_start, working_hours_end, working_days, transcript_retention_days, call_coaching_embargo_hours, operator_agent_batch_cap")
    .eq("id", org.id)
    .maybeSingle();

  return (
    <PageFrame
      title="Organization"
      description="Workspace name, timezone, working hours, sales cycle, and the CRM location this org is tied to."
    >
      <div className="space-y-8">
        <OrganizationForm
          name={org.name}
          timezone={org.timezone}
          ghlLocationId={org.ghlLocationId}
          salesCycleDays={data?.sales_cycle_days ?? 60}
          baselineLookbackDays={data?.baseline_lookback_days ?? 365}
          workingHoursStart={data?.working_hours_start?.slice(0, 5) ?? "08:00"}
          workingHoursEnd={data?.working_hours_end?.slice(0, 5) ?? "18:00"}
          workingDays={data?.working_days ?? [1, 2, 3, 4, 5]}
          transcriptRetentionDays={data?.transcript_retention_days ?? 365}
          callCoachingEmbargoHours={data?.call_coaching_embargo_hours ?? 48}
          operatorAgentBatchCap={data?.operator_agent_batch_cap ?? 10}
          showOperatorAgentBatchCap={isPlatformAdmin}
        />
        <FollowUpOnboardingNote />
      </div>
    </PageFrame>
  );
}
