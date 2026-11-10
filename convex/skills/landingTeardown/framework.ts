/**
 * The owner's landing page framework (docs/rebuild/landing-page-framework.md), as data. A landing page is a
 * sequence of objections answered in the order the reader raises them: eleven sections, each with one job.
 * A teardown matches each section of a page to one of these jobs. Nothing here is invented: the names, jobs
 * and copy rules are the document's.
 */

export const SECTION_KEYS = ["nav", "hero", "results", "problem", "solution", "offer", "compare", "process", "roles", "faq", "finalCta"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export type FrameworkSection = {
  key: SectionKey;
  name: string;
  /** The one job the framework gives this section. */
  job: string;
  /** The objection in the reader's head that the section answers. */
  objection: string;
  /** What the framework says the copy does. */
  copy: string;
  /** The framework leaves Results out when there is no real proof; every other section is expected. */
  expected: boolean;
};

export const FRAMEWORK: readonly FrameworkSection[] = [
  { key: "nav", name: "Nav", job: "Keep the next step always one tap away.", objection: "How do I take the next step?", copy: "A logo and a CTA with a verb (\"Book a call\"), never \"Submit\" or \"Learn more\". No menu links.", expected: true },
  { key: "hero", name: "Hero", job: "In 5 seconds, tell the right person \"this is for you\" and the wrong person \"this isn't\".", objection: "Is this for me?", copy: "A qualifier badge naming the avatar and a threshold, a headline stating the outcome in the reader's words, a one-sentence subline saying how, one CTA. Scarcity only if true.", expected: true },
  { key: "results", name: "Results", job: "Prove it works before you explain how.", objection: "Does it work?", copy: "Each card leads with the number, then one line of context, then a direct quote with name and role. No proof, no section.", expected: false },
  { key: "problem", name: "Problem agitation", job: "Make the reader feel understood, then feel the cost of waiting.", objection: "Do you understand my problem?", copy: "Each pain is a specific, recognizable moment followed by a cost tag. 3 to 6 of them.", expected: true },
  { key: "solution", name: "Solution", job: "Resolve every pain, one for one.", objection: "Will it fix my problem?", copy: "Each problem reframed as an outcome, present tense, no feature jargon. Mirrors the problem grid exactly.", expected: true },
  { key: "offer", name: "The offer", job: "Show exactly what they get so the price feels small next to it.", objection: "What exactly do I get, and what does it cost?", copy: "Every deliverable as a noun phrase, one line that removes effort, then price and delivery window. Visually boxed.", expected: true },
  { key: "compare", name: "With vs without", job: "Make the status quo look like a choice with a cost.", objection: "What if I do nothing?", copy: "Matched pairs, same topic on both sides, equal row counts.", expected: true },
  { key: "process", name: "Process timeline", job: "Kill the fear of a long, messy project.", objection: "Will this be a long, messy project?", copy: "3 to 5 steps, each ending with the client's time cost.", expected: true },
  { key: "roles", name: "Your role vs ours", job: "Reinforce that it's low effort for them.", objection: "How much work is it for me?", copy: "The client's list is short and ours is long.", expected: true },
  { key: "faq", name: "FAQ", job: "Handle the objections that remain, so nobody leaves to \"think about it\".", objection: "What about price, guarantee, fit, timing, and if it doesn't work?", copy: "Questions in the buyer's voice. Required topics: price, guarantee, who it's for, how long, what if it doesn't work.", expected: true },
  { key: "finalCta", name: "Final CTA", job: "Catch the reader who scrolled the whole page and is still deciding.", objection: "I've read it all. Now what?", copy: "One line restating the outcome, one button, one scarcity or timing reminder.", expected: true },
];

export const SECTION_BY_KEY: Record<SectionKey, FrameworkSection> = Object.fromEntries(FRAMEWORK.map((row) => [row.key, row])) as Record<SectionKey, FrameworkSection>;

export function isSectionKey(value: unknown): value is SectionKey {
  return typeof value === "string" && (SECTION_KEYS as readonly string[]).includes(value);
}

/** The FAQ topics the framework requires. */
export const FAQ_TOPICS = ["price", "guarantee", "whoFor", "howLong", "whatIf"] as const;
export type FaqTopic = (typeof FAQ_TOPICS)[number];
export const FAQ_TOPIC_WORDS: Record<FaqTopic, string> = { price: "price", guarantee: "guarantee", whoFor: "who it's for", howLong: "how long", whatIf: "what if it doesn't work" };

/** Button wording the framework rules out. */
export const WEAK_CTA = /^(submit|learn more|click here|read more|send|go|continue|next)$/i;

/** The framework, as the model is told it. */
export function frameworkBrief() {
  return FRAMEWORK.map((row, index) => `${index + 1}. ${row.key} (${row.name}). Job: ${row.job} Answers: "${row.objection}" Copy: ${row.copy}`).join("\n");
}
