import { REPORTING_PANELS } from "@/lib/reporting/constants";
import { OPERATOR_WRITE_KINDS } from "@/lib/operator/types";

export const OPERATOR_READ_TOOLS = [
  "find_leads",
  "get_case_file",
  "get_score_history",
  "get_touch_history",
  "get_call_detail",
  "get_call_list",
  "get_objections",
  "get_queue",
  "get_reporting",
] as const;

export const OPERATOR_PROPOSE_TOOLS = [
  "propose_assign_leads",
  "propose_log_outcome",
  "propose_create_next_action",
  "propose_complete_next_action",
  "propose_reassign_next_action",
  "propose_override_score",
  "propose_resolve_objection",
  "propose_change_status",
  "propose_regenerate_follow_up",
] as const;

export const OPERATOR_TOOL_NAMES = [...OPERATOR_READ_TOOLS, ...OPERATOR_PROPOSE_TOOLS] as const;

export type OperatorToolName = (typeof OPERATOR_TOOL_NAMES)[number];

/**
 * Capabilities that exist in the product and must never be tools.
 * Kept as a list so tests can fail if one is added to the catalog.
 */
export const OPERATOR_FORBIDDEN_TOOLS = [
  "send_message",
  "dispatch_message",
  "approve_draft",
  "approve_follow_up",
  "retry_follow_up_send",
  "delete",
  "activate_org",
  "change_scoring_config",
  "change_org_settings",
  "manage_members",
  "billing",
  "execute_write",
  "confirm_write",
] as const;

export const PROPOSE_TO_WRITE_KIND = {
  propose_assign_leads: "assign",
  propose_log_outcome: "log_outcome",
  propose_create_next_action: "create_next_action",
  propose_complete_next_action: "complete_next_action",
  propose_reassign_next_action: "reassign_next_action",
  propose_override_score: "override_score",
  propose_resolve_objection: "resolve_objection",
  propose_change_status: "change_status",
  propose_regenerate_follow_up: "regenerate_follow_up",
} as const satisfies Record<(typeof OPERATOR_PROPOSE_TOOLS)[number], (typeof OPERATOR_WRITE_KINDS)[number]>;

export function isOperatorToolName(name: string): name is OperatorToolName {
  return (OPERATOR_TOOL_NAMES as readonly string[]).includes(name);
}

export function isProposeToolName(name: string): name is (typeof OPERATOR_PROPOSE_TOOLS)[number] {
  return (OPERATOR_PROPOSE_TOOLS as readonly string[]).includes(name);
}

type AnthropicTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

const uuidProp = { type: "string", description: "UUID." };
const uuidList = {
  type: "array",
  items: { type: "string" },
  description: "UUIDs. The full list is required. Do not omit records.",
};

export function operatorAnthropicTools(): AnthropicTool[] {
  return [
    {
      name: "find_leads",
      description:
        "Find leads in this workspace by criteria. Returns a page of rows with links. If two members share a name, do not pick — ask.",
      input_schema: {
        type: "object",
        properties: {
          q: { type: "string", description: "Name, email, or free text." },
          status: { type: "string" },
          track: { type: "string", enum: ["ready", "nurture"] },
          source: { type: "string" },
          setterId: uuidProp,
          closerId: uuidProp,
          scoreMin: { type: "integer" },
          scoreMax: { type: "integer" },
          optedFrom: { type: "string", description: "YYYY-MM-DD" },
          optedTo: { type: "string", description: "YYYY-MM-DD" },
          sort: { type: "string", enum: ["last_touch", "score", "opted_in", "status"] },
          dir: { type: "string", enum: ["asc", "desc"] },
          cursor: { type: "string", description: "Opaque cursor from a previous page." },
        },
      },
    },
    {
      name: "get_case_file",
      description: "Load one lead's case file: score, objections, next actions, calls, assignment. Does not return message bodies or revenue the operator cannot see.",
      input_schema: {
        type: "object",
        properties: { leadId: uuidProp },
        required: ["leadId"],
      },
    },
    {
      name: "get_score_history",
      description: "Score history and reasoning for one lead. Use this to explain a score.",
      input_schema: {
        type: "object",
        properties: { leadId: uuidProp },
        required: ["leadId"],
      },
    },
    {
      name: "get_touch_history",
      description: "Touch, call, and status timeline for one lead. Does not return message bodies.",
      input_schema: {
        type: "object",
        properties: {
          leadId: uuidProp,
          cursorAt: { type: "string" },
          cursorId: { type: "string" },
        },
        required: ["leadId"],
      },
    },
    {
      name: "get_call_detail",
      description: "Call metadata and extraction signals. Does not return the transcript or a conversation.",
      input_schema: {
        type: "object",
        properties: { callId: uuidProp },
        required: ["callId"],
      },
    },
    {
      name: "get_call_list",
      description: "Page of calls in this workspace.",
      input_schema: {
        type: "object",
        properties: {
          cursorAt: { type: "string" },
          cursorId: { type: "string" },
        },
      },
    },
    {
      name: "get_objections",
      description: "Objections on one lead's case file. Filter in this projection; there is no cross-lead objection query.",
      input_schema: {
        type: "object",
        properties: {
          leadId: uuidProp,
          type: { type: "string" },
          resolved: { type: "boolean" },
        },
        required: ["leadId"],
      },
    },
    {
      name: "get_queue",
      description: "Current queue and alarm rows, plus workspace members (use members to disambiguate names).",
      input_schema: {
        type: "object",
        properties: {
          assigned: { type: "string", enum: ["all", "me", "unassigned", "me_or_unassigned"] },
          track: { type: "string", enum: ["ready", "nurture"] },
          status: { type: "string" },
          source: { type: "string" },
          scoreMin: { type: "integer" },
          scoreMax: { type: "integer" },
          breached: { type: "boolean" },
          cursor: { type: "string" },
        },
      },
    },
    {
      name: "get_reporting",
      description: "Reporting panel figures. Owner and admin only. A setter does not get empty numbers — they get a permission error.",
      input_schema: {
        type: "object",
        properties: {
          panel: { type: "string", enum: [...REPORTING_PANELS] },
          range: { type: "string", enum: ["since_activation", "last_30d", "last_90d", "custom"] },
          from: { type: "string", description: "YYYY-MM-DD for custom range." },
          to: { type: "string", description: "YYYY-MM-DD for custom range." },
        },
        required: ["panel"],
      },
    },
    {
      name: "propose_assign_leads",
      description:
        "Propose assigning or reassigning leads. Does not execute. The operator must confirm in this run. Never guess between two people with the same first name.",
      input_schema: {
        type: "object",
        properties: {
          leadIds: uuidList,
          setterId: { type: ["string", "null"] },
          closerId: { type: ["string", "null"] },
        },
        required: ["leadIds"],
      },
    },
    {
      name: "propose_log_outcome",
      description: "Propose logging a touch outcome. Irreversible. Does not execute until confirmed.",
      input_schema: {
        type: "object",
        properties: {
          leadId: uuidProp,
          channel: { type: "string" },
          direction: { type: "string" },
          outcome: { type: "string" },
          note: { type: "string" },
        },
        required: ["leadId", "channel", "direction", "outcome"],
      },
    },
    {
      name: "propose_create_next_action",
      description: "Propose creating a next action. Irreversible (there is no delete). Does not execute until confirmed.",
      input_schema: {
        type: "object",
        properties: {
          leadId: uuidProp,
          actionText: { type: "string" },
          dueAt: { type: ["string", "null"] },
        },
        required: ["leadId", "actionText"],
      },
    },
    {
      name: "propose_complete_next_action",
      description: "Propose completing a next action. Irreversible. Does not execute until confirmed.",
      input_schema: {
        type: "object",
        properties: {
          leadId: uuidProp,
          nextActionId: uuidProp,
        },
        required: ["leadId", "nextActionId"],
      },
    },
    {
      name: "propose_reassign_next_action",
      description: "Propose changing the owner of an open next action. Does not execute until confirmed.",
      input_schema: {
        type: "object",
        properties: {
          leadId: uuidProp,
          nextActionId: uuidProp,
          ownerMemberId: { type: ["string", "null"] },
        },
        required: ["leadId", "nextActionId"],
      },
    },
    {
      name: "propose_override_score",
      description: "Propose a manual score override. Factors 0–100 or omitted. Total is computed. Does not execute until confirmed.",
      input_schema: {
        type: "object",
        properties: {
          leadId: uuidProp,
          reasoning: { type: "string" },
          timeline: { type: ["integer", "null"] },
          investment_capacity: { type: ["integer", "null"] },
          decision_authority: { type: ["integer", "null"] },
          pain_severity: { type: ["integer", "null"] },
        },
        required: ["leadId", "reasoning"],
      },
    },
    {
      name: "propose_resolve_objection",
      description: "Propose resolving an objection. Irreversible. Does not execute until confirmed.",
      input_schema: {
        type: "object",
        properties: {
          leadId: uuidProp,
          objectionId: uuidProp,
          note: { type: "string" },
        },
        required: ["leadId", "objectionId", "note"],
      },
    },
    {
      name: "propose_change_status",
      description: "Propose a status change. Closed won cannot be set by hand. Does not execute until confirmed.",
      input_schema: {
        type: "object",
        properties: {
          leadId: uuidProp,
          status: { type: "string" },
          note: { type: "string" },
        },
        required: ["leadId", "status", "note"],
      },
    },
    {
      name: "propose_regenerate_follow_up",
      description:
        "Propose regenerating an existing pending follow-up draft. Does not send. Does not approve. There is no tool that creates a draft from scratch.",
      input_schema: {
        type: "object",
        properties: {
          draftId: uuidProp,
          instruction: { type: "string" },
        },
        required: ["draftId", "instruction"],
      },
    },
  ];
}
