import Link from "next/link";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export type StepperStep = {
  id: string;
  label: string;
  href?: string;
  done?: boolean;
};

/**
 * Where you are in a sequence you can come back to.
 *
 * Deliberately a list of named steps rather than a progress bar. Onboarding is
 * a form the client fills in, not a game with a completion score, and a bar
 * creeping toward full is the wrong thing to put in front of them.
 */
export function Stepper({
  steps,
  currentId,
  label,
  className,
}: {
  steps: StepperStep[];
  currentId: string;
  label: string;
  className?: string;
}) {
  const currentIndex = steps.findIndex((step) => step.id === currentId);

  return (
    <nav aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      <ol className="flex flex-wrap gap-2">
        {steps.map((step, index) => {
          const current = step.id === currentId;
          const done = step.done ?? false;

          const content = (
            <>
              <span
                aria-hidden
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-semibold",
                  current
                    ? "bg-brand-500 text-ink-950"
                    : done
                      ? "bg-brand-500/20 text-brand-300"
                      : "border border-white/15 text-dim"
                )}
              >
                {done && !current ? <Check className="size-2.5" /> : index + 1}
              </span>
              <span className="truncate">{step.label}</span>
            </>
          );

          const classes = cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] transition-colors",
            current
              ? "border-brand-500/60 bg-brand-500/[0.12] text-white"
              : done
                ? "border-white/[0.12] bg-white/[0.03] text-silver hover:border-white/25 hover:text-white"
                : "border-white/[0.08] text-dim hover:border-white/20 hover:text-white"
          );

          return (
            <li key={step.id}>
              {step.href ? (
                <Link
                  href={step.href}
                  aria-current={current ? "step" : undefined}
                  className={classes}
                >
                  {content}
                </Link>
              ) : (
                <span aria-current={current ? "step" : undefined} className={classes}>
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="sr-only">
        Step {currentIndex + 1} of {steps.length}.
      </p>
    </nav>
  );
}
