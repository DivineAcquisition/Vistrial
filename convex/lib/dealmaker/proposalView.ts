/**
 * A proposal as the Calls tab, and later the lead's own page, draw it (docs/rebuild/dealmaker.md, 0.8 and 4.5).
 * The package, the price, the guarantee and the proof are the Offer folder's own words, copied in code.
 */

import { v, type Infer } from "convex/values";

const offerItem = v.object({ itemId: v.id("playbookItems"), title: v.string(), body: v.string() });

export const proposalView = v.object({
  title: v.string(),
  intro: v.string(),
  /** What the lead needs, each with the quote from the call review it rests on and who said it. */
  needs: v.array(v.object({ need: v.string(), quote: v.string(), kind: v.string() })),
  package: offerItem,
  deliverables: v.array(v.string()),
  price: offerItem,
  guarantee: v.optional(offerItem),
  proof: v.array(offerItem),
  nextSteps: v.array(v.string()),
  closing: v.string(),
  checksPassed: v.boolean(),
  missing: v.array(v.string()),
});

export type ProposalView = Infer<typeof proposalView>;
