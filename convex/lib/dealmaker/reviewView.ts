/**
 * A call review as the Calls tab draws it (docs/rebuild/dealmaker.md, 4.2 "Shown as"), kept on the review's own
 * row when it is saved. Coaching notes are kept apart, on the row, because only the Owner reads them (0.8).
 */

import { v, type Infer } from "convex/values";

const label = v.union(v.literal("Your data"), v.literal("Inference"), v.literal("Untested hypothesis"), v.literal("Not enough data"));

export const reviewView = v.object({
  outcome: v.string(),
  nextStep: v.string(),
  checksPassed: v.boolean(),
  talk: v.optional(v.array(v.object({ name: v.string(), words: v.number(), share: v.number(), questions: v.number() }))),
  fit: v.array(v.object({ field: v.string(), label: v.string(), said: v.boolean(), finding: v.string(), quote: v.string(), kind: v.optional(v.string()) })),
  /** `itemId`: the Playbook objection it is, when the review matched one (counted by the Objection Playbook). */
  objections: v.array(v.object({ text: v.string(), quote: v.string(), kind: v.string(), answered: v.boolean(), answerQuote: v.string(), itemId: v.optional(v.id("playbookItems")) })),
  commitments: v.array(v.object({ owner: v.string(), what: v.string(), due: v.optional(v.number()), quote: v.string(), kind: v.string() })),
  /** The Playbook's script steps, each covered (with the quote) or not seen on the call. */
  coverage: v.array(v.object({ title: v.string(), covered: v.boolean(), quote: v.string() })),
  /** What was proposed in the CRM, or the step to do there by hand. */
  updates: v.array(v.object({ words: v.string(), state: v.union(v.literal("proposed"), v.literal("doItYourself")), detail: v.string(), label })),
  /** The recap drafted for the lead in Comms, waiting for a person. */
  recap: v.optional(v.object({ subject: v.string(), body: v.string(), draftId: v.optional(v.id("dealmakerDrafts")) })),
  missing: v.array(v.string()),
});

export type ReviewView = Infer<typeof reviewView>;
