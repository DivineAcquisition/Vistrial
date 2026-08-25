import type { Enums } from "@/types/database";

export type ProfileStage = Enums<"profile_stage">;

export const PROFILE_STAGES: ProfileStage[] = [
  "connect",
  "business",
  "funnel",
  "qualification",
  "process",
  "objections",
  "voice",
  "goals",
];

export type StageMeta = {
  stage: ProfileStage;
  title: string;
  /** One short line saying what the answers do. Not a tutorial, a reason. */
  why: string;
  /** What the client gets back the moment they submit. */
  payoff: string;
};

export const STAGE_META: Record<ProfileStage, StageMeta> = {
  connect: {
    stage: "connect",
    title: "Connect your CRM",
    why: "Everything we can read from your CRM is something we will never ask you to type.",
    payoff: "What we found in your history",
  },
  business: {
    stage: "business",
    title: "What you sell",
    why: "Price and cycle length decide when a lead counts as measurable and who you get compared against.",
    payoff: "Where you sit against comparable businesses",
  },
  funnel: {
    stage: "funnel",
    title: "Where leads come from",
    why: "Your application answers become the factors every lead is scored on.",
    payoff: "Your real speed to lead",
  },
  qualification: {
    stage: "qualification",
    title: "What makes a lead worth a call",
    why: "This is the scoring configuration, in your words rather than ours.",
    payoff: "How your real leads score under it",
  },
  process: {
    stage: "process",
    title: "How you work a lead",
    why: "This sets the alarm window, stops Vistrial sending what your CRM already sends, and is where you are told that calls are transcribed and analyzed for coaching.",
    payoff: "The gap between what you intend and what happens",
  },
  objections: {
    stage: "objections",
    title: "What they push back on",
    why: "Extraction needs your prospects' vocabulary before the first transcript arrives.",
    payoff: "Your objection taxonomy, seeded",
  },
  voice: {
    stage: "voice",
    title: "How you talk to prospects",
    why: "Two real messages you have sent are worth more than any description of your tone.",
    payoff: "A real draft for a real lead",
  },
  goals: {
    stage: "goals",
    title: "What would make this worth it",
    why: "Reporting is framed against your number instead of a generic one.",
    payoff: "Your Leak Report",
  },
};

export function isProfileStage(value: string): value is ProfileStage {
  return (PROFILE_STAGES as string[]).includes(value);
}

export function nextStage(stage: ProfileStage): ProfileStage | null {
  const index = PROFILE_STAGES.indexOf(stage);
  return index >= 0 && index < PROFILE_STAGES.length - 1 ? PROFILE_STAGES[index + 1] : null;
}

export function previousStage(stage: ProfileStage): ProfileStage | null {
  const index = PROFILE_STAGES.indexOf(stage);
  return index > 0 ? PROFILE_STAGES[index - 1] : null;
}

export function isOnboardingIncomplete(
  completed: Array<{ stage: ProfileStage; completedAt: string | null }>
): boolean {
  return firstIncompleteStage(completed) !== null;
}

export function firstIncompleteStage(
  completed: Array<{ stage: ProfileStage; completedAt: string | null }>
): ProfileStage | null {
  const done = new Set(completed.filter((row) => row.completedAt).map((row) => row.stage));
  return PROFILE_STAGES.find((stage) => !done.has(stage)) ?? null;
}
