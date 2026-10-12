import type { CustomerState, CustomerStep, StageKey } from "@/lib/onboarding/stages";

/**
 * The Owner's guided setup: one screen per step, in this order. Most steps are
 * a stage of the onboarding record; Welcome and Meet your agents are screens
 * only. A step whose stage the Owner cannot act on yet shows "Coming next".
 */

export const SETUP_STEPS = [
  { slug: "welcome", stage: null, short: "Welcome" },
  { slug: "approach", stage: "approach", short: "Approach" },
  { slug: "business", stage: "business_details", short: "Business" },
  { slug: "crm", stage: "crm", short: "CRM" },
  { slug: "messaging", stage: "messaging", short: "Texting" },
  { slug: "email", stage: "email", short: "Email" },
  { slug: "approvers", stage: "approvers", short: "Approvers" },
  { slug: "escalation", stage: "escalation", short: "Escalation" },
  { slug: "team", stage: "team", short: "Team" },
  { slug: "import", stage: "lead_import", short: "Leads" },
  { slug: "agents", stage: null, short: "Agents" },
  { slug: "test", stage: "sample_test", short: "Test" },
  { slug: "review", stage: "go_live", short: "Go live" },
] as const satisfies ReadonlyArray<{ slug: string; stage: StageKey | null; short: string }>;

export type SetupSlug = (typeof SETUP_STEPS)[number]["slug"];

export function isSetupSlug(value: unknown): value is SetupSlug {
  return typeof value === "string" && SETUP_STEPS.some((step) => step.slug === value);
}

export function stepFor(slug: SetupSlug) {
  return SETUP_STEPS.find((step) => step.slug === slug)!;
}

export function stageState(steps: CustomerStep[], stage: StageKey | null): CustomerState | null {
  if (!stage) return null;
  return steps.find((step) => step.key === stage)?.state ?? null;
}

/** Done for the progress indicator. */
export function slugDone(slug: SetupSlug, steps: CustomerStep[], extra: { welcomeSeen: boolean; sampleStarted: boolean }): boolean {
  if (slug === "welcome") return extra.welcomeSeen;
  if (slug === "agents") return extra.sampleStarted;
  const state = stageState(steps, stepFor(slug).stage);
  return state === "done" || state === "skipped";
}

/** The next screen after this one. */
export function nextSlug(slug: SetupSlug): SetupSlug | null {
  const index = SETUP_STEPS.findIndex((step) => step.slug === slug);
  return SETUP_STEPS[index + 1]?.slug ?? null;
}

export function previousSlug(slug: SetupSlug): SetupSlug | null {
  const index = SETUP_STEPS.findIndex((step) => step.slug === slug);
  return index > 0 ? SETUP_STEPS[index - 1]!.slug : null;
}

/** Where to resume: the first step the Owner can act on that is not done. */
export function resumeSlug(steps: CustomerStep[], extra: { welcomeSeen: boolean; sampleStarted: boolean }): SetupSlug {
  if (!extra.welcomeSeen) return "welcome";
  for (const step of SETUP_STEPS) {
    if (step.slug === "welcome") continue;
    if (step.slug === "agents") {
      if (!extra.sampleStarted) return "agents";
      continue;
    }
    const state = stageState(steps, step.stage);
    if (state === "waiting_on_customer" || state === "blocked") return step.slug;
  }
  return "review";
}

export function setupHref(slug: SetupSlug): string {
  return `/app/onboarding/step/${slug}`;
}

/** "About 25 minutes of your time" across the steps still to do. */
export const TOTAL_TIME = "About 45 minutes of your time in total, spread over a few days while your team does their part.";
