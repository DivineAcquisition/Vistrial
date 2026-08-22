import Link from "next/link";

import { PROFILE_STAGES, STAGE_META, type ProfileStage } from "@/lib/profile/stages";
import type { StageProgress } from "@/lib/profile/types";
import { cn } from "@/lib/utils";

/**
 * Where they are, and where they can jump back to. Deliberately a list of
 * named steps rather than a progress bar: this is a form, not a game.
 */
export function StageRail({
  current,
  stages,
}: {
  current: ProfileStage;
  stages: StageProgress[];
}) {
  const done = new Set(stages.filter((row) => row.completedAt).map((row) => row.stage));

  return (
    <nav aria-label="Onboarding stages" className="mb-6 flex flex-wrap gap-2">
      {PROFILE_STAGES.map((stage) => {
        const isCurrent = stage === current;
        return (
          <Link
            key={stage}
            href={`/app/onboarding/${stage}`}
            aria-current={isCurrent ? "step" : undefined}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[13px] transition-colors",
              isCurrent
                ? "border-brand-500/60 bg-brand-500/[0.12] text-white"
                : done.has(stage)
                  ? "border-white/[0.12] bg-white/[0.03] text-silver hover:text-white"
                  : "border-white/[0.08] text-dim hover:text-white"
            )}
          >
            {STAGE_META[stage].title}
            {done.has(stage) && !isCurrent ? <span className="ml-2 text-brand-300">·</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
