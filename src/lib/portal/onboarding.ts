import type { StatusTone } from "@/lib/portal/requests";

export const ONBOARDING_STATES: Record<string, { label: string; tone: StatusTone }> = {
  done: { label: "Done", tone: "good" },
  in_progress: { label: "In progress", tone: "warning" },
  waiting_on_customer: { label: "Waiting on you", tone: "warning" },
  waiting_on_team: { label: "Waiting on your team", tone: "neutral" },
};

export const ONBOARDING_STEP_KEYS = [
  "approach",
  "crm",
  "messaging",
  "approvers",
  "escalation",
  "team",
  "test",
  "go_live",
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

export type OnboardingStep = {
  key: OnboardingStepKey;
  label: string;
  state: keyof typeof ONBOARDING_STATES;
  why?: string;
  note?: string;
  eta?: string;
  action?: { label: string; href: string };
};

export function isOnboardingStep(value: unknown): value is OnboardingStep {
  if (!value || typeof value !== "object") return false;
  const step = value as OnboardingStep;
  return (
    (ONBOARDING_STEP_KEYS as readonly string[]).includes(step.key) &&
    typeof step.label === "string" &&
    typeof step.state === "string" &&
    step.state in ONBOARDING_STATES
  );
}
