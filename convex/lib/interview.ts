/**
 * Dealmaker's guided interview (docs/rebuild/dealmaker.md, 0.6): about ten minutes, asked only for the gaps
 * left after it has read the CRM, the Playbook and what a study filed. The questions are fixed here, in code;
 * no model is called. Each answer is the business's own word: Playbook items from it are "Your data", and
 * settings are saved as given.
 */

import type { Doc } from "../_generated/dataModel";
import { STALLED_CHOICES } from "../skills/pipelineForensics/shapes";
import { STAGES, type Stage } from "./playbook";

export const QUIET_CHOICES = STALLED_CHOICES;
export const DEFAULT_QUIET_DAYS = 14;

/** The channels a business may allow Dealmaker to draft for (0.5, Comms). */
export const CHANNELS = ["sms", "email", "voice", "dm"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABEL: Record<Channel, string> = { sms: "Text messages", email: "Email", voice: "Voice notes", dm: "Instagram and Facebook messages" };

export const INTERVIEW_LIMITS = { meaning: 300, tag: 60, tags: 20, answer: 2000, proof: 6 } as const;

export const QUESTIONS = [
  { id: "stages", title: "What each pipeline stage means", ask: "In your own words, what has happened when a deal reaches each stage?" },
  { id: "quietDays", title: "When a deal has gone quiet", ask: "After how many days with no reply and no stage change should Dealmaker treat a deal as quiet?" },
  { id: "script", title: "Your sales call", ask: "Walk through your call: how you open, what you ask, how you pitch and how you close." },
  { id: "packages", title: "What you sell", ask: "Your packages: what each includes and the price a proposal may use." },
  { id: "proof", title: "Proof you may quote", ask: "Results, case studies or testimonials Dealmaker may quote to a lead." },
  { id: "voice", title: "How you sound", ask: "How your messages should sound, and how you sign off." },
  { id: "consent", title: "Who may be contacted, and how", ask: "The CRM tags that mean a lead agreed to be contacted, and the channels Dealmaker may draft for." },
] as const;
export type QuestionId = (typeof QUESTIONS)[number]["id"];

export type InterviewState = {
  items: Pick<Doc<"playbookItems">, "kind" | "stage">[];
  settings: Pick<Doc<"dealmakerSettings">, "quietDays" | "stageMeanings" | "consentTags" | "channels"> | null;
  /** The CRM's stages, when a CRM is connected. */
  stages: { ref: string; name: string }[] | null;
};

/** The stages of a call still missing from the script. */
export function scriptGaps(items: InterviewState["items"]): Stage[] {
  return STAGES.filter((stage) => !items.some((row) => row.kind === "scriptStep" && row.stage === stage));
}

/** Which questions are still open. A question with nothing to ask (no CRM for stages) is not open. */
export function openQuestions(state: InterviewState): QuestionId[] {
  const has = (kind: string) => state.items.some((row) => row.kind === kind);
  const meanings = new Set((state.settings?.stageMeanings ?? []).map((row) => row.stageRef));
  const open: Record<QuestionId, boolean> = {
    stages: !!state.stages?.length && state.stages.some((row) => !meanings.has(row.ref)),
    quietDays: state.settings?.quietDays === undefined,
    script: scriptGaps(state.items).length > 0,
    packages: !has("package") || !has("price"),
    proof: !has("proof"),
    voice: !has("voice"),
    consent: !state.settings?.channels?.length,
  };
  return QUESTIONS.map((row) => row.id).filter((id) => open[id]);
}

export const INTERVIEW_TEXT = {
  badQuiet: `Choose ${QUIET_CHOICES.join(", ")} days.`,
  unknownStage: "That stage is not in your CRM's pipeline.",
  empty: "Write an answer, or skip this question.",
  noChannel: "Choose at least one channel.",
} as const;
