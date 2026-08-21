"use client";

import Link from "next/link";

import { SETUP_STEP_COPY, SETUP_STEPS, type SetupStepId } from "@/lib/onboarding/constants";
import { stepHref } from "@/lib/onboarding/steps";
import type { SetupStepState } from "@/lib/onboarding/types";
import { btnPrimary, btnSecondary, btnSizeSm } from "@/lib/ui";

export function SetupStepNav({
  steps,
  current,
}: {
  steps: SetupStepState[];
  current: SetupStepId;
}) {
  const currentIndex = SETUP_STEPS.indexOf(current);
  const previous = currentIndex > 0 ? SETUP_STEPS[currentIndex - 1] : null;
  const next = currentIndex < SETUP_STEPS.length - 1 ? SETUP_STEPS[currentIndex + 1] : null;
  const previousState = steps.find((step) => step.id === previous);
  const nextState = steps.find((step) => step.id === next);

  return (
    <div className="mb-8 space-y-6">
      <ol className="grid gap-2 sm:grid-cols-3">
        {steps.map((step, index) => {
          const copy = SETUP_STEP_COPY[step.id];
          const active = step.id === current;
          const inner = (
            <>
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dim">
                {index + 1}
              </span>
              <span className="block text-sm text-white">{copy.title}</span>
              {step.complete ? (
                <span className="mt-1 block text-xs text-flag-good">Done</span>
              ) : step.locked ? (
                <span className="mt-1 block text-xs text-dim">Waiting on an earlier step</span>
              ) : null}
            </>
          );
          if (step.locked) {
            return (
              <li key={step.id} className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3 opacity-60">
                {inner}
              </li>
            );
          }
          return (
            <li key={step.id}>
              <Link
                href={stepHref(step.id)}
                className={`block rounded-xl border px-3 py-3 ${
                  active ? "border-brand-500/40 bg-brand-950" : "border-white/10 hover:border-white/25"
                }`}
              >
                {inner}
              </Link>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-3">
        {previous && previousState && !previousState.locked ? (
          <Link href={stepHref(previous)} className={`${btnSecondary} ${btnSizeSm}`}>
            Back
          </Link>
        ) : null}
        {next && nextState && !nextState.locked ? (
          <Link href={stepHref(next)} className={`${btnPrimary} ${btnSizeSm}`}>
            Continue
          </Link>
        ) : null}
      </div>
    </div>
  );
}
