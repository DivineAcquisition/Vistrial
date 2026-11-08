import { v, type Infer } from "convex/values";

/**
 * Where an asset stands.
 * - draft: waiting for approval.
 * - needsReview: an agent's draft that failed a completion check. A person edits it (back to draft) or rejects it.
 * - approved: a person approved this version.
 * - rejected: a person rejected it with a reason. It leaves the queue and keeps its versions.
 * - archived: put away.
 */
export const assetStatus = v.union(
  v.literal("draft"),
  v.literal("needsReview"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("archived"),
);
export type AssetStatus = Infer<typeof assetStatus>;
