import { SETUP_STEPS, type SetupStepId } from "@/lib/onboarding/constants";
import type { SetupStepState } from "@/lib/onboarding/types";

export function isSetupStepId(value: string | null | undefined): value is SetupStepId {
  return Boolean(value && (SETUP_STEPS as readonly string[]).includes(value));
}

export function firstIncompleteStep(steps: SetupStepState[]): SetupStepId {
  const open = steps.find((step) => !step.complete && !step.locked);
  if (open) return open.id;
  const last = steps[steps.length - 1];
  return last?.id ?? "organization";
}

export function parseSetupStep(
  value: string | string[] | undefined,
  steps: SetupStepState[]
): SetupStepId {
  const raw = Array.isArray(value) ? value[0] : value;
  if (isSetupStepId(raw)) {
    const match = steps.find((step) => step.id === raw);
    if (match && !match.locked) return raw;
  }
  return firstIncompleteStep(steps);
}

export function stepHref(id: SetupStepId): string {
  return `/app/setup?step=${id}`;
}
