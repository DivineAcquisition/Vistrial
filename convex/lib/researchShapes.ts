import { v, type Infer } from "convex/values";

/**
 * What supports a claim. The label a person sees comes from the basis in code, never from the model.
 * - observed: seen in at least one collected source.
 * - inferred: reasoned from at least one collected source, shown as an inference.
 * - hypothesis: needs no source, always shown as untested.
 * - firstParty: from the customer's own data (a CSV upload now, connected accounts later).
 * - insufficient: the "Not enough data" line. It makes no claim.
 */
export const basis = v.union(
  v.literal("observed"),
  v.literal("inferred"),
  v.literal("hypothesis"),
  v.literal("firstParty"),
  v.literal("insufficient"),
);
export type Basis = Infer<typeof basis>;

/** Where a source reference came from. `customerData` is the only first-party platform. */
export const platform = v.union(
  v.literal("web"),
  v.literal("youtube"),
  v.literal("tiktok"),
  v.literal("instagram"),
  v.literal("metaAdLibrary"),
  v.literal("customerData"),
);
export type Platform = Infer<typeof platform>;

export const sourceKind = v.union(
  v.literal("page"),
  v.literal("video"),
  v.literal("short"),
  v.literal("post"),
  v.literal("reel"),
  v.literal("ad"),
  v.literal("dataset"),
);

/** Whether the original can still be viewed. `linkOnly` means we may show a link card and nothing more. */
export const availability = v.union(
  v.literal("available"),
  v.literal("linkOnly"),
  v.literal("unavailable"),
  v.literal("removed"),
);

/** A source adapter's honest status for one run. */
export const sourceState = v.union(
  v.literal("available"),
  v.literal("partial"),
  v.literal("unavailable"),
  v.literal("awaitingAuthorization"),
);
export type SourceState = Infer<typeof sourceState>;

export const embed = v.object({
  provider: v.union(v.literal("youtube"), v.literal("tiktok"), v.literal("instagram")),
  id: v.string(),
});

/** Fields the model filled in. Shown as the model's classification, never as fact. */
export const classification = v.object({
  hook: v.optional(v.string()),
  offer: v.optional(v.string()),
  callToAction: v.optional(v.string()),
  format: v.optional(v.string()),
  audienceHypothesis: v.optional(v.string()),
  relevance: v.optional(v.union(v.literal("high"), v.literal("medium"), v.literal("low"))),
  classifiedBy: v.literal("model"),
  classifiedAt: v.number(),
});

export const projectStatus = v.union(v.literal("draft"), v.literal("running"), v.literal("ready"), v.literal("archived"));
