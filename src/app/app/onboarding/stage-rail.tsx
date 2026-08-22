import { Stepper } from "@/components/ui/stepper";
import { PROFILE_STAGES, STAGE_META, type ProfileStage } from "@/lib/profile/stages";
import type { StageProgress } from "@/lib/profile/types";

/** Where they are in onboarding, and where they can jump back to. */
export function StageRail({
  current,
  stages,
}: {
  current: ProfileStage;
  stages: StageProgress[];
}) {
  const done = new Set(stages.filter((row) => row.completedAt).map((row) => row.stage));

  return (
    <Stepper
      label="Onboarding stages"
      className="mb-6"
      currentId={current}
      steps={PROFILE_STAGES.map((stage) => ({
        id: stage,
        label: STAGE_META[stage].title,
        href: `/app/onboarding/${stage}`,
        done: done.has(stage),
      }))}
    />
  );
}
