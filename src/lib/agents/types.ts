import type { AgentHaltApp } from "@/lib/agents/constants";
import type { OrgRole } from "@/types/database";

/** Consequence, not which app is involved. */
export const AGENT_TIERS = [
  "read",
  "produce",
  "write_internal",
  "write_external",
  "contact",
] as const;
export type AgentTier = (typeof AGENT_TIERS)[number];

export const AGENT_MODES = ["on_demand", "triggered", "scheduled"] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

export const AGENT_RUN_STATES = [
  "queued",
  "running",
  "awaiting_confirmation",
  "awaiting_batch",
  "completed",
  "failed",
  "dead_lettered",
  "cancelled",
  "stopped_step_limit",
  "stopped_time_limit",
  "stopped_cap",
  "stopped_halt",
  "observation",
] as const;
export type AgentRunState = (typeof AGENT_RUN_STATES)[number];

export const MODEL_TIERS = ["opus", "sonnet", "haiku"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

/**
 * Work a step declares. The router maps this to a model ID from configuration.
 * Application code never names a model ID.
 */
export const WORK_KINDS = [
  "playbook",
  "follow_up_draft",
  "extraction",
  "verification",
  "agent_planning",
  "summarize",
  "classify",
] as const;
export type WorkKind = (typeof WORK_KINDS)[number];

export const TRIGGER_KINDS = [
  "on_demand",
  "lead_crossed_threshold",
  "transcript_landed",
  "second_reschedule",
  "payment_failed",
  "schedule_cron",
] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

export const AGENT_OUTPUT_TYPES = [
  "conversation",
  "asset",
  "proposal",
  "none",
] as const;
export type AgentOutputType = (typeof AGENT_OUTPUT_TYPES)[number];

/** Curated agents. Adding one is a code change. There is no canvas. */
export const AGENT_IDS = ["operator"] as const;
export type AgentId = (typeof AGENT_IDS)[number];

export type AgentActor = {
  userId: string;
  memberId: string;
  role: OrgRole;
  displayName: string;
};

export type AgentDefinition = {
  id: AgentId;
  /** What a person reads. No invented nouns. */
  label: string;
  summary: string;
  modes: readonly AgentMode[];
  maxTier: Exclude<AgentTier, "contact">;
  tools: readonly string[];
  workKind: WorkKind;
  outputType: AgentOutputType;
  /** Writes (internal or external). Observation is the default enable path. */
  writes: boolean;
  /** On-demand operator already shipped enabled. Every other agent ships off. */
  defaultEnabled: boolean;
};

export type OrgAgentSettings = {
  orgId: string;
  agentId: AgentId;
  enabled: boolean;
  observationMode: boolean;
  dailyRunCap: number;
  dailySpendCapUsd: number;
};

export type ModelRoute = {
  workKind: WorkKind;
  tier: ModelTier;
  modelId: string;
  escalateToTier: ModelTier | null;
  useBatchWhenAsync: boolean;
};

export type ResolvedModel = {
  workKind: WorkKind;
  tier: ModelTier;
  modelId: string;
  version: string;
  escalateToTier: ModelTier | null;
  useBatch: boolean;
  cachePrompt: boolean;
};

export type AgentToolKind = "read" | "produce" | "propose_internal" | "propose_external";

export type PlainPreview = {
  system: string;
  operation: string;
  records: Array<{
    id: string;
    label: string;
    before: string;
    after: string;
  }>;
  reversible: boolean;
  irreversibleLabel: string | null;
};

export type ExternalOperationId =
  | "crm.add_tag"
  | "crm.write_note"
  | "crm.update_allowlisted_field"
  | "crm.move_pipeline_stage"
  | "crm.create_task"
  | "crm.update_opportunity_value"
  | "calendar.create_hold";

export type CompanyFact = {
  companyName: string;
  fact: string;
  source: string;
  foundAt: string;
};

export type AssetDraft = {
  title: string;
  body: string;
  dataBasis: string;
  sampleSize: number;
  verbatimFlags: Array<{ excerpt: string; source: string }>;
};

export type CapDecision =
  | { ok: true }
  | { ok: false; reason: "halted" | "disabled" | "run_cap" | "spend_cap" | "no_identity"; message: string };

export type AgentHaltState = {
  global: boolean;
  apps: Record<AgentHaltApp, boolean>;
};
