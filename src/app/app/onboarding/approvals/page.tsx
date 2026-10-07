import { finishApprovalStep } from "@/app/app/settings/approvals/actions";
import { ApprovalActionsForm, ApprovalLimitsForm } from "@/app/app/settings/approvals/approval-gate-form";
import { FinishLaterButton } from "@/app/app/onboarding/finish-later";
import { StageRail } from "@/app/app/onboarding/stage-rail";
import { PageFrame } from "@/components/app/page-frame";
import { Button } from "@/components/ui/button";
import { canEditApprovalGate } from "@/lib/home/catalog";
import { gateFormRows, loadGateState } from "@/lib/home/gate";
import { loadBusinessProfileState, requireProfileAccess } from "@/lib/profile/load";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "What runs without asking" };

/**
 * Optional last step of onboarding. Skipping keeps the defaults: every
 * message to a lead or client waits for a person.
 */
export default async function OnboardingApprovalsPage() {
  const ctx = await requireProfileAccess();
  const supabase = await createClient();
  const [state, gate] = await Promise.all([loadBusinessProfileState(ctx.org.id), loadGateState(supabase, ctx.org.id)]);
  const editable = canEditApprovalGate(ctx.role, ctx.isStaff);

  return (
    <PageFrame
      eyebrow="Optional"
      title="What runs without asking"
      description="By default, every message to a lead or client waits for someone to approve it. Change that here, or skip and keep the defaults. You can change it any time in Settings."
      secondaryActions={<FinishLaterButton />}
    >
      <StageRail current="approvals" stages={state.stages} approvalsReviewed={Boolean(gate.limits.reviewedAt)} />
      <div className="flex flex-col gap-6">
        <ApprovalActionsForm rows={gateFormRows(gate)} editable={editable} />
        <ApprovalLimitsForm limits={gate.limits} timeZone={ctx.org.timezone} editable={editable} />
        <div className="flex flex-wrap items-center gap-3">
          <form action={finishApprovalStep.bind(null, false)}>
            <Button type="submit" variant="primary" size="lg">
              Done
            </Button>
          </form>
          <form action={finishApprovalStep.bind(null, true)}>
            <Button type="submit" variant="secondary" size="lg">
              Skip and keep the defaults
            </Button>
          </form>
        </div>
      </div>
    </PageFrame>
  );
}
