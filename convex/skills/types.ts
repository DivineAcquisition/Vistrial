import type { GenericDatabaseReader } from "convex/server";

import type { DataModel, Doc } from "../_generated/dataModel";
import type { ClaimInput } from "../lib/evidence";
import type { ToolSlug, WorkKind } from "../lib/registry";

/** A step the run has already taken, as a skill sees it. Never page or model text. */
export type StepRecord = Pick<Doc<"runSteps">, "index" | "kind" | "toolSlug" | "status" | "resultCode" | "resultId"> & {
  workKind?: string;
};

/** Limits for one of Claude's web tools on a model step. The skill must also declare the tool. */
export type WebToolLimits = { maxUses: number; allowedDomains?: string[]; blockedDomains?: string[] };

/** What a skill asks the runtime to do next. */
export type SkillStep =
  | { kind: "tool"; toolSlug: ToolSlug }
  | {
      kind: "model";
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
      /** Output room for this step, never more than the work kind allows. Smaller rooms make estimates tighter. */
      maxOutputTokens?: number;
      /** May spend the skill's reserve. Only the completion check's revision does. */
      useReserve?: boolean;
    }
  /**
   * Pause until a person answers. The answer is saved as a verified fact under `factKey`, then the run
   * resumes. Only keys in the skill's `asks` list may be asked, so the model can never add a question.
   */
  | { kind: "ask"; factKey: string }
  /** Run the skill's completion check, in code, over what the run has saved. */
  | { kind: "check" }
  /** Save the task brief, built in code, as the run's "brief" artifact. Costs nothing. */
  | { kind: "brief"; body: string };

export type SkillContext = {
  /** Read-only. A skill decides; the runtime writes. */
  db: GenericDatabaseReader<DataModel>;
  run: Pick<Doc<"agentRuns">, "_id" | "workspaceId" | "skillSlug" | "inputRef" | "startedBy">;
  /** Every step taken so far, in order. */
  steps: StepRecord[];
};

/** One completion check, in plain words for the person who reviews the draft. */
export type CheckResult = { key: string; passed: boolean; detail: string };

/** What a skill's report builder hands the runtime to save. The runtime screens every claim. */
export type BuiltReport = {
  title: string;
  /** What a person reads. */
  body: string;
  /** The structured report, saved with the run for the completion check. */
  structured: unknown;
  claims: (ClaimInput & { basis: NonNullable<ClaimInput["basis"]> })[];
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
  /** A run must be started on a research project in the workspace. */
  needsProject?: boolean;
  /** The next step after `steps`, or null when the skill is finished. Must be deterministic. */
  nextStep(context: SkillContext): SkillStep | null | Promise<SkillStep | null>;
  /** The questions this skill may ask, by fact key. Worded here, in code, never by the model. */
  asks?: Readonly<Record<string, string>>;
  /**
   * Cents of the run cap kept back for the completion check and one revision. A skill with a reserve
   * also gets an estimate before every model call, and a call that would pass its allowance does not start.
   */
  reserveCents?: number;
  /** Builds the report `asset.create` and `asset.addVersion` save. Without it those tools save the test asset. */
  buildReport?(context: SkillContext): Promise<BuiltReport>;
  /**
   * The completion check. A skill that has one cannot finish as passed unless its latest check passed;
   * otherwise its asset is saved as Needs Review with the failed checks.
   */
  check?(context: SkillContext & { report: unknown }): Promise<CheckResult[]>;
};
