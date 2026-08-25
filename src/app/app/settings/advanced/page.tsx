import { PageFrame } from "@/components/app/page-frame";
import { OrganizationForm } from "@/app/app/settings/organization/organization-form";
import { Panel } from "@/components/ui/panel";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { ADVANCED_SETTINGS_PAGES } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import { btnSecondary, btnSizeSm, cardTitle, helperClass } from "@/lib/ui";
import Link from "next/link";

export default async function AdvancedSettingsPage() {
  const { org, isPlatformAdmin } = await requireOrgSettingsManager();
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select(
      "sales_cycle_days, baseline_lookback_days, working_hours_start, working_hours_end, working_days, transcript_retention_days, call_coaching_embargo_hours, operator_agent_batch_cap"
    )
    .eq("id", org.id)
    .maybeSingle();

  return (
    <PageFrame
      title="Advanced"
      description="Specialist controls. Day-to-day settings stay on You, Notifications, Workspace, and People."
    >
      <div className="space-y-8">
        <section className="space-y-3">
          <h2 className={cardTitle}>Workspace policy</h2>
          <p className={helperClass}>
            Sales cycle, history window, retention, and coaching delay. These are not daily knobs.
          </p>
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
            surface="policy"
          />
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          {ADVANCED_SETTINGS_PAGES.map((page) => (
            <Panel key={page.href} className="p-6">
              <h2 className={cardTitle}>{page.label}</h2>
              <p className={`mt-2 ${helperClass}`}>{page.description}</p>
              <div className="mt-5">
                <Link href={page.href} className={`${btnSecondary} ${btnSizeSm}`}>
                  Open {page.label.toLowerCase()}
                </Link>
              </div>
            </Panel>
          ))}
        </div>
      </div>
    </PageFrame>
  );
}
