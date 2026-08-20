import { PageFrame } from "@/components/app/page-frame";
import { UnconfiguredState } from "@/components/app/unconfigured-state";
import { requireOrgSettingsManager } from "@/lib/auth/gates";

export default async function ScoringSettingsPage() {
  await requireOrgSettingsManager();

  return (
    <PageFrame
      title="Scoring"
      description="Readiness weights for this workspace, once the scoring engine is installed."
    >
      <UnconfiguredState
        title="Scoring is not installed yet"
        detail="Readiness weights will be configured here after the scoring engine is in place. There is nothing to set until that ships — the form is not missing, it has not been built."
      />
    </PageFrame>
  );
}
