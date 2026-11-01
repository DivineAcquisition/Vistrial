import type { GenericDatabaseReader } from "convex/server";

import type { DataModel, Doc } from "../_generated/dataModel";
import type { ToolSlug, WorkKind } from "../lib/registry";

/** A step the run has already taken, as a skill sees it. Never page or model text. */
export type StepRecord = Pick<Doc<"runSteps">, "index" | "kind" | "toolSlug" | "status" | "resultCode" | "resultId">;

/** What a skill asks the runtime to do next. */
export type SkillStep =
  | { kind: "tool"; toolSlug: ToolSlug }
  /** `input` reaches the model as is. Wrap anything that came from outside with `wrapUntrusted`. */
  | { kind: "model"; workKind: WorkKind; input: string };

export type SkillContext = {
  /** Read-only. A skill decides; the runtime writes. */
  db: GenericDatabaseReader<DataModel>;
  run: Pick<Doc<"agentRuns">, "_id" | "workspaceId" | "skillSlug" | "inputRef" | "startedBy">;
  /** Every step taken so far, in order. */
  steps: StepRecord[];
};

/**
 * A skill is a module the runtime asks for its next step. The runtime owns everything that can stop a
 * run (membership, pause, halt, caps, routes), the idempotent commit of each step, and cost. The skill
 * owns the order of its steps, the tools it may use, and what it hands back.
 */
export type SkillModule = {
  slug: string;
  /** The agent this skill belongs to. A run must be started on that agent. */
  agentSlug: string;
  name: string;
  /** Runs only where ALLOW_DEV_SKILLS is "true". */
  devOnly: boolean;
  /** The whole list of tools this skill may call. Model output can never add one. */
  tools: readonly ToolSlug[];
  /** What the skill hands back. */
  output: { assetKind: Doc<"assets">["kind"]; title: string };
  /** The next step after `steps`, or null when the skill is finished. Must be deterministic. */
  nextStep(context: SkillContext): SkillStep | null | Promise<SkillStep | null>;
};
