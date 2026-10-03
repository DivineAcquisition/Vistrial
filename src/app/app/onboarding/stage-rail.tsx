import { Stepper } from "@/components/ui/stepper";
import { PROFILE_STAGES, STAGE_META, type ProfileStage } from "@/lib/profile/stages";
import type { StageProgress } from "@/lib/profile/types";

export const VISTRIAL_STEP = { id: "vistrial", label: "What Vistrial may do", href: "/app/onboarding/vistrial" } as const;

/** Where they are in onboarding, and where they can jump back to. */
export function StageRail({
  current,
  stages,
  vistrialDone = false,
}: {
  current: ProfileStage | typeof VISTRIAL_STEP.id;
  stages: StageProgress[];
  vistrialDone?: boolean;
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
        { id: VISTRIAL_STEP.id, label: VISTRIAL_STEP.label, href: VISTRIAL_STEP.href, done: vistrialDone },
      ]}
    />
  );
}
