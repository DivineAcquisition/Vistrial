import Link from "next/link";

import { ActivationGate } from "@/app/app/settings/business-profile/activation-gate";
import { AdvancedWriteLock } from "@/components/app/advanced-write-lock";
import { PageFrame } from "@/components/app/page-frame";
import { requireOrgSettingsManager } from "@/lib/auth/gates";
import { loadBusinessProfileState } from "@/lib/profile/load";
import { loadAdvancedAccess } from "@/lib/settings/org";
import { btnSecondary, btnSizeSm, helperClass } from "@/lib/ui";

export default async function AdvancedActivationPage() {
  const ctx = await requireOrgSettingsManager();
  const access = await loadAdvancedAccess(ctx);
  const state = await loadBusinessProfileState(ctx.org.id);
  const backfillRequirement = state.activation.hard.find((item) => item.key === "backfill_resolved");
  const backfillNeedsFallback =
    backfillRequirement !== undefined &&
    !backfillRequirement.ok &&
    backfillRequirement.detail.includes("unusable");

  return (
    <PageFrame
      title="Activation"
      description="The timestamp is read-only here until you type to move it. Moving it shifts every historical outcome figure."
    >
      <AdvancedWriteLock locked={!access.writable}>
      <ActivationGate
        activation={state.activation}
        changes={state.activationChanges}
        activatedByName={state.activatedByName}
        backfillNeedsFallback={backfillNeedsFallback}
        orgName={ctx.org.name}
      />
      </AdvancedWriteLock>
      <p className={`mt-6 ${helperClass}`}>
        The living business profile that scoring and follow-up read is next to this timestamp.
      </p>
      <div className="mt-3">
        <Link href="/app/settings/business-profile" className={`${btnSecondary} ${btnSizeSm} inline-flex`}>
          Open the business profile
        </Link>
      </div>
    </PageFrame>
  );
}
