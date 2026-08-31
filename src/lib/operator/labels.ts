import type { OperatorStepState, OperatorWriteKind } from "@/lib/operator/types";

export const OPERATOR_TOOL_LABELS: Record<string, string> = {
  find_leads: "Finding leads",
  get_case_file: "Opening a case file",
  get_score_history: "Reading score history",
  get_touch_history: "Reading touch history",
  get_call_detail: "Opening a call",
  get_call_list: "Listing calls",
  get_objections: "Reading objections",
  get_queue: "Reading the queue",
  get_reporting: "Reading reporting figures",
  propose_assign_leads: "Proposing an assignment change",
  propose_log_outcome: "Proposing a logged outcome",
  propose_create_next_action: "Proposing a next action",
  propose_complete_next_action: "Proposing to complete a next action",
  propose_reassign_next_action: "Proposing to reassign a next action",
  propose_override_score: "Proposing a score override",
  propose_resolve_objection: "Proposing to resolve an objection",
  propose_change_status: "Proposing a status change",
  propose_regenerate_follow_up: "Proposing to regenerate a follow-up draft",
};

export const OPERATOR_WRITE_LABELS: Record<OperatorWriteKind, string> = {
  assign: "Assign",
  log_outcome: "Log outcome",
  create_next_action: "Create next action",
  complete_next_action: "Complete next action",
  reassign_next_action: "Reassign next action",
  override_score: "Override score",
  resolve_objection: "Resolve objection",
  change_status: "Change status",
  regenerate_follow_up: "Regenerate follow-up draft",
};

export const OPERATOR_RUN_STATUS_LABELS: Record<string, string> = {
  queued: "Waiting to start",
  running: "Working on it",
  awaiting_confirmation: "Waiting for you",
  awaiting_approval: "Waiting for you",
  applied: "Done",
  succeeded: "Done",
  completed: "Done",
  failed: "Could not finish",
  cancelled: "Stopped",
  rejected: "Turned down",
  rate_limited: "Try again later",
  stopped_step_limit: "Stopped",
  stopped_time_limit: "Stopped",
};

export function operatorRunStatusLabel(status: string): string {
  return OPERATOR_RUN_STATUS_LABELS[status] ?? "Working";
}

export function toolLabel(name: string): string {
  return OPERATOR_TOOL_LABELS[name] ?? "Working";
}

export function stepStateTone(
  state: OperatorStepState
): "brand" | "good" | "warning" | "critical" | "neutral" {
  if (state === "running") return "brand";
  if (state === "done") return "good";
  if (state === "permission") return "warning";
  return "critical";
}

export function stepStateLabel(state: OperatorStepState): string {
  if (state === "running") return "running";
  if (state === "done") return "done";
  if (state === "permission") return "no access";
  return "failed";
}
