import { v, type Infer } from "convex/values";

/** Who a fact came from. Only `owner` and `assumption` may have no source reference. */
export const factSourceType = v.union(
  v.literal("owner"),
  v.literal("agent"),
  v.literal("assumption"),
  v.literal("upload"),
  v.literal("feedback"),
);
export type FactSourceType = Infer<typeof factSourceType>;

export const factStatus = v.union(v.literal("unverified"), v.literal("verified"), v.literal("disputed"), v.literal("superseded"));
export type FactStatus = Infer<typeof factStatus>;

export const feedbackKind = v.union(v.literal("rejection"), v.literal("revisionRequest"));
