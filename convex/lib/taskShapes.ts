/**
 * The stored shapes of step 2: agent tasks, approvals and Briefing posts. Validators live here so the
 * schema, the functions and the tests read one definition. docs/rebuild/tasks-briefing-home.md.
 */
import { v } from "convex/values";

export const TASK_STATUSES = ["proposed", "approved", "running", "needsYou", "done", "declined"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const taskStatus = v.union(v.literal("proposed"), v.literal("approved"), v.literal("running"), v.literal("needsYou"), v.literal("done"), v.literal("declined"));

/** The six columns of the board. "result" is a finished task whose outcome was measured at a check-in. */
export const TASK_COLUMNS = ["proposed", "approved", "running", "needsYou", "done", "result"] as const;
export type TaskColumn = (typeof TASK_COLUMNS)[number];

/**
 * What a task is expected to return: a range in one measure, and how it is known. "inferred" reasons from
 * sources, "firstParty" from the organization's own figures, "insufficient" carries no numbers at all.
 * The labels a person reads come from BASIS_LABEL (lib/evidence.ts): Inference, Your data, Not enough data.
 */
export const RETURN_BASES = ["inferred", "firstParty", "insufficient"] as const;
export type ReturnBasis = (typeof RETURN_BASES)[number];
export const expectedReturn = v.object({
  basis: v.union(v.literal("inferred"), v.literal("firstParty"), v.literal("insufficient")),
  /** The measure, in a few plain words: "booked calls". Missing for "insufficient". */
  metric: v.optional(v.string()),
  period: v.optional(v.union(v.literal("week"), v.literal("month"), v.literal("quarter"))),
  low: v.optional(v.number()),
  high: v.optional(v.number()),
});
export type ExpectedReturn = { basis: ReturnBasis; metric?: string; period?: "week" | "month" | "quarter"; low?: number; high?: number };

/** What stands behind a task: a collected source, a report, an earlier decision, or a figure of the organization's own. */
export const taskEvidence = v.object({
  kind: v.union(v.literal("sourceRef"), v.literal("asset"), v.literal("decision"), v.literal("figure")),
  /** The record's id, for the three kinds that point at one. A figure carries its words in `label`. */
  refId: v.optional(v.string()),
  label: v.string(),
});
export type TaskEvidence = { kind: "sourceRef" | "asset" | "decision" | "figure"; refId?: string; label: string };

export const proposedBy = v.union(
  v.object({ kind: v.literal("agent"), agentSlug: v.string(), runId: v.optional(v.id("agentRuns")) }),
  v.object({ kind: v.literal("person"), userId: v.string() }),
);

/** What the agent is asked when the task is approved: the words, and the skill when it is already clear. */
export const taskWork = v.object({ skillSlug: v.optional(v.string()), ask: v.string() });

/**
 * A change the organization makes itself, taken from a report: an opportunity of a research report, or an
 * item of an offer analysis, growth diagnosis or page teardown. Approving it records the decision in the
 * outcome loop (convex/decisions.ts), which is where its Result is later measured.
 */
export const taskTry = v.object({
  kind: v.union(v.literal("opportunity"), v.literal("assetItem")),
  projectId: v.optional(v.id("researchProjects")),
  assetId: v.optional(v.id("assets")),
  index: v.number(),
  checkInDays: v.number(),
});

export const APPROVAL_KINDS = ["publish", "spend", "accountChange", "housekeeping", "task"] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];
export const approvalKind = v.union(v.literal("publish"), v.literal("spend"), v.literal("accountChange"), v.literal("housekeeping"), v.literal("task"));
export const approvalStatus = v.union(v.literal("waiting"), v.literal("approved"), v.literal("declined"), v.literal("expired"));
export type ApprovalStatus = "waiting" | "approved" | "declined" | "expired";

export const BRIEFING_KINDS = ["approval", "weeklyReport", "finished", "alert", "draft", "trend"] as const;
export type BriefingKind = (typeof BRIEFING_KINDS)[number];
export const briefingKind = v.union(v.literal("approval"), v.literal("weeklyReport"), v.literal("finished"), v.literal("alert"), v.literal("draft"), v.literal("trend"));
