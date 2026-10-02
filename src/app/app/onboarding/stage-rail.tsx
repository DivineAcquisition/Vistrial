import { Stepper } from "@/components/ui/stepper";
import { PROFILE_STAGES, STAGE_META, type ProfileStage } from "@/lib/profile/stages";
import type { StageProgress } from "@/lib/profile/types";

/** The approval step sits after the profile stages. It is optional, so it never blocks the app. */
export const APPROVAL_STEP = { id: "approvals", label: "What runs without asking", href: "/app/onboarding/approvals" } as const;

/** Where they are in onboarding, and where they can jump back to. */
export function StageRail({
  current,
  stages,
  approvalsReviewed = false,
}: {
  current: ProfileStage | typeof APPROVAL_STEP.id;
  stages: StageProgress[];
  approvalsReviewed?: boolean;
}) {
  const done = new Set(stages.filter((row) => row.completedAt).map((row) => row.stage));

  return (
    <Stepper
      label="Onboarding stages"
      className="mb-6"
      currentId={current}
      steps={[
        ...PROFILE_STAGES.map((stage) => ({
          id: stage,
          label: STAGE_META[stage].title,
          href: `/app/onboarding/${stage}`,
          done: done.has(stage),
        })),
        { ...APPROVAL_STEP, done: approvalsReviewed },
      ]}
    />
  );
}
