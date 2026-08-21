import { PageFrame } from "@/components/app/page-frame";
import { OrganizationForm, FollowUpOnboardingNote } from "@/app/app/settings/organization/organization-form";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { createClient } from "@/lib/supabase/server";

export default async function OrganizationSettingsPage() {
  const { org } = await requireOrgSettingsManager();
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("sales_cycle_days, baseline_lookback_days")
    .eq("id", org.id)
    .maybeSingle();

  return (
    <PageFrame
      title="Organization"
      description="Workspace name, timezone, sales cycle, and the CRM location this org is tied to."
    >
      <div className="space-y-8">
        <OrganizationForm
          name={org.name}
          timezone={org.timezone}
          ghlLocationId={org.ghlLocationId}
          salesCycleDays={data?.sales_cycle_days ?? 60}
          baselineLookbackDays={data?.baseline_lookback_days ?? 365}
        />
        <FollowUpOnboardingNote />
      </div>
    </PageFrame>
  );
}
