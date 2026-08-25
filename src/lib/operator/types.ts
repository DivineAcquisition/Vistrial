import type { Json } from "@/types/database";

export const OPERATOR_RUN_STATUSES = [
  "running",
  "awaiting_confirmation",
  "completed",
  "failed",
  "cancelled",
  "stopped_step_limit",
  "stopped_time_limit",
  "rate_limited",
] as const;

export type OperatorRunStatus = (typeof OPERATOR_RUN_STATUSES)[number];

export const OPERATOR_STEP_STATES = ["running", "done", "failed", "permission"] as const;
export type OperatorStepState = (typeof OPERATOR_STEP_STATES)[number];

export const OPERATOR_CONFIRM_DECISIONS = ["pending", "confirmed", "cancelled", "adjusted"] as const;
export type OperatorConfirmDecision = (typeof OPERATOR_CONFIRM_DECISIONS)[number];

export const OPERATOR_WRITE_KINDS = [
  "assign",
  "log_outcome",
  "create_next_action",
  "complete_next_action",
  "reassign_next_action",
  "override_score",
  "resolve_objection",
  "change_status",
  "regenerate_follow_up",
] as const;

export type OperatorWriteKind = (typeof OPERATOR_WRITE_KINDS)[number];

export type OperatorLeadLink = {
  id: string;
  name: string;
  href: string;
  status?: string | null;
  score?: number | null;
};

export type OperatorUiList = {
  kind: "leads" | "calls" | "objections" | "touches" | "generic";
  rows: Array<Record<string, string | number | null>>;
  links: OperatorLeadLink[];
};

export type OperatorStepView = {
  id: string;
  seq: number;
  toolName: string;
  label: string;
  arguments: Json;
  result: Json | null;
  resultSummary: string | null;
  state: OperatorStepState;
  errorKind: string | null;
  errorText: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  ui: OperatorUiList | null;
};

export type OperatorChangeField = {
  field: string;
  before: string | null;
  after: string | null;
};

export type OperatorChangeRecord = {
  id: string;
  leadId: string | null;
  label: string;
  href: string | null;
  fields: OperatorChangeField[];
};

export type OperatorBatchReport = {
  succeeded: Array<{ id: string; label: string }>;
  failed: Array<{ id: string; label: string; error: string }>;
  notAttempted: Array<{ id: string; label: string }>;
};

export type OperatorConfirmationView = {
  id: string;
  runId: string;
  stepId: string | null;
  toolName: string;
  writeKind: OperatorWriteKind;
  reversible: boolean;
  irreversibleReason: string | null;
  recordCount: number;
  records: OperatorChangeRecord[];
  decision: OperatorConfirmDecision;
  decidedBy: string | null;
  decidedAt: string | null;
  executeResult: OperatorBatchReport | null;
  undoUntil: string | null;
  undoneAt: string | null;
  undoResult: OperatorBatchReport | null;
  createdAt: string;
  verificationGate: "confirm" | "question";
  verificationFaults: Array<{ code: string; where: string; what: string }>;
};

export type OperatorRunView = {
  id: string;
  orgId: string;
  memberId: string;
  userId: string;
  requestText: string;
  followUpText: string | null;
  followUpUsed: boolean;
  status: OperatorRunStatus;
  finalResponse: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  stepCount: number;
  stopReason: string | null;
  createdAt: string;
  finishedAt: string | null;
  steps: OperatorStepView[];
  confirmations: OperatorConfirmationView[];
};

export type OperatorRunSummary = {
  id: string;
  requestText: string;
  status: OperatorRunStatus;
  createdAt: string;
  finishedAt: string | null;
  stepCount: number;
};

export type ToolFailureKind = "permission" | "failed" | "batch_cap" | "cancelled";

export type ToolReadOk = {
  ok: true;
  kind: "read";
  summary: string;
  model: unknown;
  ui: OperatorUiList | null;
  leadIds: string[];
};

export type ToolProposeOk = {
  ok: true;
  kind: "propose";
  summary: string;
  model: unknown;
  confirmation: OperatorConfirmationView;
  leadIds: string[];
};

export type ToolFail = {
  ok: false;
  kind: ToolFailureKind;
  error: string;
  summary: string;
  leadIds: string[];
};

export type ToolOutcome = ToolReadOk | ToolProposeOk | ToolFail;

export type AgentContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

export type AgentMessage =
  | { role: "user"; content: string | AgentToolResult[] }
  | { role: "assistant"; content: string | AgentContentBlock[] };

export type AgentToolResult = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};
