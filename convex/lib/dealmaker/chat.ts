/**
 * Dealmaker's chat router, in code (docs/rebuild/dealmaker.md, 8.3): a message is either a simple question
 * about the pipeline, answered from the CRM in code with no model call, or work for one of Dealmaker's
 * skills, which the chat plans and prices before anything runs. When nothing clearly leads it asks which;
 * it never picks silently. Pure, so a test can read every case.
 */

import { workLabel } from "../workWords";

export const DM_ROUTES = ["pipeline-forensics", "deal-briefing", "conversation-intelligence", "follow-up-engine"] as const;
export type DmRoute = (typeof DM_ROUTES)[number];

export const QUESTIONS = ["openDeals", "moves", "showRate", "calls"] as const;
export type Question = (typeof QUESTIONS)[number];

export function isDmRoute(value: unknown): value is DmRoute {
  return (DM_ROUTES as readonly unknown[]).includes(value);
}

/** The choices the chat offers when it cannot tell. `name` is the work's label, never the skill's name. */
export const DM_CHOICES: { skill: DmRoute; chip: string; name: string; does: string }[] = [
  { skill: "pipeline-forensics", chip: "Review my pipeline", name: workLabel("pipeline-forensics"), does: "finds where deals stall in your CRM's own figures, with a short plan" },
  { skill: "deal-briefing", chip: "Prepare me for a call", name: workLabel("deal-briefing"), does: "writes a pre-call brief for one booked call" },
  { skill: "conversation-intelligence", chip: "Review a call", name: workLabel("conversation-intelligence"), does: "reviews one call from its transcript or your notes" },
  { skill: "follow-up-engine", chip: "Draft my follow-ups", name: workLabel("follow-up-engine"), does: "drafts the one next message each deal needs, for you to send" },
];

export const DM_QUESTION = "I can help with that four ways. Which do you want?";

type Signal = { pattern: RegExp; weight: number };

const SIGNALS: Record<DmRoute, Signal[]> = {
  "pipeline-forensics": [
    { pattern: /\b(review|audit|diagnos\w*|analy[sz]e|look at)\b.{0,20}\b(my|our|the) (pipeline|deals|funnel)\b/, weight: 5 },
    { pattern: /\b(stall(s|ed|ing)?|stuck|leak(s|ing)?|bottleneck|drop(ping)? off)\b/, weight: 3 },
    { pattern: /\b(pipeline review|win rate|why (are|do) (deals|leads))\b/, weight: 3 },
  ],
  "deal-briefing": [
    { pattern: /\b(brief|prep(are)?( me)?|get ready)\b.{0,30}\b(call|meeting|appointment)\b/, weight: 5 },
    { pattern: /\b(pre-?call|before (my|the) call|brief me)\b/, weight: 4 },
  ],
  "conversation-intelligence": [
    { pattern: /\b(review|score|analy[sz]e|how did)\b.{0,30}\b(my|the|that|last) (call|calls|meeting|transcript)\b/, weight: 5 },
    { pattern: /\b(call review|transcript|what (went|did i do) (wrong|well))\b/, weight: 3 },
  ],
  "follow-up-engine": [
    { pattern: /\b(follow[- ]?ups?|follow up|chase|nudge|check in with|re-?engage)\b/, weight: 4 },
    { pattern: /\b(draft|write)\b.{0,20}\b(messages?|texts?|emails?)\b/, weight: 3 },
  ],
};

const QUESTION_PATTERNS: Record<Question, RegExp> = {
  openDeals: /\b(how many|how much|what('?s| is))\b.{0,30}\b(open deals|deals open|pipeline (worth|value)|in (my|the) pipeline)\b/,
  moves: /\b(what|who)\b.{0,30}\b(needs?|should i)\b.{0,30}\b(today|next|a move|follow(ing)? up|chase)\b/,
  showRate: /\b(show[- ]?rate|no[- ]?shows?)\b/,
  calls: /\b(what|which|how many)\b.{0,20}\b(calls?|appointments?)\b.{0,20}\b(today|this week|booked|coming up)\b/,
};

/** A simple question the chat answers in code, or null. */
export function questionOf(text: string): Question | null {
  const flat = text.toLowerCase().replace(/\s+/g, " ");
  for (const question of QUESTIONS) if (QUESTION_PATTERNS[question].test(flat)) return question;
  return null;
}

export function dmScores(text: string): Record<DmRoute, number> {
  const flat = text.toLowerCase().replace(/\s+/g, " ");
  const out = Object.fromEntries(DM_ROUTES.map((route) => [route, 0])) as Record<DmRoute, number>;
  for (const route of DM_ROUTES) for (const signal of SIGNALS[route]) if (signal.pattern.test(flat)) out[route] += signal.weight;
  return out;
}

/** The one skill that clearly leads, or null when nothing does or two tie. */
export function dmIntent(text: string): DmRoute | null {
  const scores = dmScores(text);
  const ranked = [...DM_ROUTES].sort((a, b) => scores[b] - scores[a]);
  if (scores[ranked[0]] === 0 || scores[ranked[0]] === scores[ranked[1]]) return null;
  return ranked[0];
}

/** A tapped chip names its work exactly; anything typed is read as a question, then as work. */
export function dmRoute(text: string): { kind: "question"; question: Question } | { kind: "work"; skill: DmRoute } | { kind: "unclear" } {
  const flat = text.trim().toLowerCase();
  const tapped = DM_CHOICES.find((row) => row.chip.toLowerCase() === flat || row.name.toLowerCase() === flat);
  if (tapped) return { kind: "work", skill: tapped.skill };
  const question = questionOf(text);
  if (question) return { kind: "question", question };
  const skill = dmIntent(text);
  return skill ? { kind: "work", skill } : { kind: "unclear" };
}

/** What each piece of work will do, said before anything runs. */
export const PLAN_WORDS: Record<DmRoute, string> = {
  "pipeline-forensics": "I'll read your CRM's own figures, find where deals stall, and write a short plan. I change nothing in your CRM.",
  "deal-briefing": "I'll write a pre-call brief for this call from your CRM, your notes and your Playbook. I contact nobody.",
  "conversation-intelligence": "I'll review this call against your Playbook, quoting what was said. I contact nobody.",
  "follow-up-engine": "I'll find the deals that need one next message and draft each for you in Comms. Nothing is sent until a person sends it on.",
};

/** Where the result appears. */
export const RESULT_TAB: Record<DmRoute, { tab: string; words: string }> = {
  "pipeline-forensics": { tab: "pipeline", words: "The review appears in Pipeline when it is ready." },
  "deal-briefing": { tab: "calls", words: "The brief appears in Calls when it is ready." },
  "conversation-intelligence": { tab: "calls", words: "The review appears in Calls when it is ready." },
  "follow-up-engine": { tab: "comms", words: "The drafts appear in Comms when they are ready." },
};

export const NOTHING_RUNS = "Nothing runs or spends until you press Start.";
