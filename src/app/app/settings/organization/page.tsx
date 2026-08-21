import { PageFrame } from "@/components/app/page-frame";
import { OrganizationForm, FollowUpOnboardingNote } from "@/app/app/settings/organization/organization-form";
import { ActivationSettings } from "@/app/app/settings/organization/activation-settings";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { createClient } from "@/lib/supabase/server";
import type { GoliveRunResult } from "@/lib/onboarding/types";
import type { Json } from "@/types/database";

export default async function OrganizationSettingsPage() {
  const { org } = await requireOrgSettingsManager();
  const supabase = await createClient();
  const [{ data }, { data: orgRow }, { data: goliveRow }] = await Promise.all([
    supabase
      .from("organizations")
      .select("sales_cycle_days, baseline_lookback_days")
      .eq("id", org.id)
      .maybeSingle(),
    supabase.from("organizations").select("activated_at").eq("id", org.id).maybeSingle(),
    supabase
      .from("golive_runs")
      .select("id, status, steps")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const lastGolive = parseGolive(goliveRow);

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
        <ActivationSettings
          activatedAt={orgRow?.activated_at ?? null}
          slug={org.slug}
          lastGolive={lastGolive}
        />
        <FollowUpOnboardingNote />
      </div>
    </PageFrame>
  );
}

function parseGolive(
  row: { id: string; status: string; steps: Json } | null
): GoliveRunResult | null {
  if (!row || !Array.isArray(row.steps)) return null;
  const steps = row.steps.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== "string" || typeof rec.label !== "string" || typeof rec.detail !== "string") {
      return [];
    }
    return [
      {
        id: rec.id as GoliveRunResult["steps"][number]["id"],
        ok: rec.ok === true,
        label: rec.label,
        detail: rec.detail,
        fixStep: typeof rec.fixStep === "string" ? (rec.fixStep as GoliveRunResult["steps"][number]["fixStep"]) : typeof rec.fix_step === "string" ? (rec.fix_step as GoliveRunResult["steps"][number]["fixStep"]) : null,
      },
    ];
  });
  if (steps.length === 0) return null;
  return { ok: row.status === "passed", runId: row.id, steps };
}
