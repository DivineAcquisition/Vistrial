/**
 * A pre-call brief as the Calls tab draws it (docs/rebuild/dealmaker.md, 4.3 "Shown as"): kept on the brief's
 * own row when it is saved, so the screen reads one row and never re-derives anything. Each line carries the
 * evidence label it earned in code; quotes keep the kind of evidence they are (buyer's words, a rep's account).
 */

import { v, type Infer } from "convex/values";

const evidenceWord = v.union(v.literal("Your data"), v.literal("Inference"), v.literal("Untested hypothesis"), v.literal("Not enough data"));

export const briefView = v.object({
  summary: v.string(),
  /** Code's own brief, with no model step: nothing was known beyond the booking. */
  codeOnly: v.boolean(),
  checksPassed: v.boolean(),
  firstCall: v.boolean(),
  facts: v.array(v.object({ group: v.union(v.literal("who"), v.literal("soFar")), label: v.string(), display: v.string(), kind: v.string() })),
  readiness: v.array(
    v.object({
      field: v.string(),
      label: v.string(),
      established: v.boolean(),
      finding: v.string(),
      quote: v.string(),
      /** "Buyer's words" or "Rep's account", and where it was said. */
      kind: v.optional(v.string()),
      source: v.optional(v.string()),
    }),
  ),
  handoff: v.optional(v.object({ by: v.string(), text: v.string() })),
  commitments: v.array(v.object({ owner: v.string(), what: v.string(), due: v.string(), quote: v.string() })),
  disagreements: v.array(v.string()),
  cover: v.array(v.object({ point: v.string(), label: evidenceWord })),
  offerFit: v.optional(v.object({ title: v.string(), why: v.string() })),
  objections: v.array(v.object({ text: v.string(), where: v.string(), label: evidenceWord })),
  openingQuestion: v.string(),
  /** What the lead's own site says about the business, each line Observed on a page that was fetched. */
  publicRead: v.optional(v.object({ domain: v.string(), from: v.union(v.literal("given"), v.literal("email")), lines: v.array(v.object({ text: v.string(), url: v.string() })) })),
  missing: v.array(v.string()),
});

export type BriefView = Infer<typeof briefView>;
