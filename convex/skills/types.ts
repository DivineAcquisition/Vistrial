import type { GenericDatabaseReader } from "convex/server";

import type { DataModel, Doc } from "../_generated/dataModel";
import type { ToolSlug, WorkKind } from "../lib/registry";

/** A step the run has already taken, as a skill sees it. Never page or model text. */
export type StepRecord = Pick<Doc<"runSteps">, "_id" | "index" | "kind" | "toolSlug" | "status" | "resultCode" | "resultId" | "phase">;

/** Limits for one of Claude's web tools on a model step. The skill must also declare the tool. */
export type WebToolLimits = { maxUses: number; allowedDomains?: string[]; blockedDomains?: string[] };

/** What a skill asks the runtime to do next. */
export type SkillStep =
  | { kind: "tool"; toolSlug: ToolSlug; phase?: string }
  /**
   * Ask a person, then wait. The question must be one the skill declares in `questions`: the model never
   * asks on its own. The run spends nothing while it waits.
   */
  | { kind: "ask"; questionKey: string; phase?: string }
  | {
      kind: "model";
      phase?: string;
      /** May spend the skill's reserve (the completion check's one revision). Other steps never can. */
      useReserve?: boolean;
      workKind: WorkKind;
      /** Reaches the model as is. Wrap anything that came from outside with `wrapUntrusted`. */
      input: string;
      system?: string;
      /** Needs "web.search" in the skill's tools. */
      webSearch?: WebToolLimits;
      /** Needs "web.fetch" in the skill's tools. */
      webFetch?: WebToolLimits & { maxContentTokens?: number };
      /** JSON schema for the answer. Output that does not parse is retried once, then the step fails. */
      outputSchema?: Record<string, unknown>;
    };

export type SkillContext = {
  /** Read-only. A skill decides; the runtime writes. */
  db: GenericDatabaseReader<DataModel>;
  run: Pick<Doc<"agentRuns">, "_id" | "workspaceId" | "skillSlug" | "inputRef" | "startedBy" | "costCents">;
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
  /** The run must be started on a research project in the same workspace. */
  needsProject?: boolean;
  /** Runs only where ALLOW_DEV_SKILLS is "true". */
  devOnly: boolean;
  /** The whole list of tools this skill may call. Model output can never add one. */
  tools: readonly ToolSlug[];
  /** What the skill hands back. */
  output: { assetKind: Doc<"assets">["kind"]; title: string };
  /**
   * Cents of the run cap held back for the completion check and its one revision. Before every model call
   * the runtime estimates the worst case and refuses a call that would spend into this reserve, unless the
   * step sets `useReserve`.
   */
  reserveCents?: number;
  /** The only questions this skill may ask a person, by key, with the words shown. */
  questions?: Readonly<Record<string, string>>;
  /** The next step after `steps`, or null when the skill is finished. Must be deterministic. */
  nextStep(context: SkillContext): SkillStep | null | Promise<SkillStep | null>;
};
