import Link from "next/link";
import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
          const variant = current ? "default" : done ? "secondary" : "outline";

          const content = (
            <>
              <span
                aria-hidden="true"
                className="grid size-4 shrink-0 place-items-center rounded-full bg-current/15 text-[10px] font-semibold"
              >
                {done && !current ? <Check className="size-2.5" /> : index + 1}
              </span>
              <span className="truncate">{step.label}</span>
            </>
          );

          return (
            <li key={step.id}>
              <Badge
                variant={variant}
                className="h-7 gap-2 rounded-full px-3"
                render={
                  step.href ? (
                    <Link
                      href={step.href}
                      aria-current={current ? "step" : undefined}
                    />
                  ) : undefined
                }
                aria-current={!step.href && current ? "step" : undefined}
              >
                {content}
              </Badge>
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
