/**
 * The words the product says out loud.
 *
 * Internal names stay in the code — columns are still `lead_type`, jobs still
 * "dispatch", the pipeline still "extracts". This module is the one place that
 * decides what a person reads on screen, so the two can drift apart on purpose.
 *
 * Rules for anything added here: no acronyms, no invented nouns, and a label
 * that a business owner would say to another person without explaining it.
 */

/** How ready a lead is, as a state someone can act on rather than a number. */
export const READINESS = {
  /** At or above the ready threshold. Call today. */
  ready: "Ready now",
  /** Scored, below the threshold, still worth a person's time. */
  working: "Worth working",
  /** Long game. Keep warm, do not burn a call slot on it. */
  nurture: "Nurture",
  /** No score yet, which is a fact about us, not about them. */
  unscored: "Not scored yet",
} as const;

export type ReadinessState = keyof typeof READINESS;

/** Plain replacements for the internal vocabulary, used across surfaces. */
export const WORDS = {
  readinessScore: "How ready they are",
  readinessFactors: "What we look at",
  waitingTooLong: "Waiting too long",
  goneQuiet: "Gone quiet",
  contact: "Contact",
  contacts: "Contacts",
  automatic: "Automatic",
  byAPerson: "By a person",
  send: "Send",
  whatWasSaid: "What was said on the call",
  whatChanged: "What changed this",
  leadGroup: "Group of leads from the same period",
  waitingToProcess: "Waiting to process",
  unmatchedRecording: "Recording we couldn't match to a call",
  measuringSince: "The date we started measuring",
  checkGroup: "Leads we work regardless of score, to keep the scoring honest",
  followUpPath: "Follow-up path",
  responseWindow: "How long they can wait",
  goingQuiet: "Going quiet",
  notes: "Notes",
  askVistrial: "Ask Vistrial",
  teamApp: "Team app",
  ownerPortal: "Owner portal",
} as const;

/** Title case for the four factors, used on settings sliders. */
export const FACTOR_TITLE = {
  timeline: "How soon they want to move",
  investment_capacity: "What they can spend",
  decision_authority: "Whether they decide",
  pain_severity: "How much it hurts",
} as const;

/**
 * What moved how ready someone is. The internal trigger is an enum; a person
 * wants to know whether it was the form, the call, or a colleague.
 */
export const SCORE_CHANGE_CAUSE = {
  intake: "From what they filled in",
  call: "From the call",
  manual: "Changed by a person",
  event: "From something they did",
} as const;

/** The four things the score looks at, said as questions about the person. */
export const FACTOR_PLAIN = {
  timeline: "how soon they want to move",
  investment_capacity: "what they can spend",
  decision_authority: "whether they decide",
  pain_severity: "how much it hurts",
} as const;

/**
 * Where a lead sits, given its score and this workspace's ready threshold.
 * Ordering still uses the number; people should not have to.
 */
export function readinessState(
  score: number | null,
  readyThreshold: number,
  isNurture: boolean
): ReadinessState {
  if (score === null) return "unscored";
  if (score >= readyThreshold) return "ready";
  return isNurture ? "nurture" : "working";
}

export function readinessLabel(state: ReadinessState): string {
  return READINESS[state];
}

export function readinessTone(state: ReadinessState): "brand" | "neutral" | "warning" {
  if (state === "ready") return "brand";
  if (state === "unscored") return "warning";
  return "neutral";
}

/**
 * How long someone has been waiting, said the way a person would say it.
 * Anything under a minute is "just now" — nobody needs seconds.
 */
export function waitingFor(sinceIso: string | null, nowIso: string): string {
  if (!sinceIso) return "—";
  const ms = new Date(nowIso).getTime() - new Date(sinceIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}
