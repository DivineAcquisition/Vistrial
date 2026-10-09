import { APPROVAL_ACTIONS } from "@/lib/config/registry";

/**
 * Every action that can wait on a person, and what performing it means.
 *
 * - reachesPeople: a lead or client sees the result. These always wait for a
 *   person; the database refuses to let them run on their own.
 * - perform: how the action happens once approved. "person_sends" means the
 *   approver (or the assigned person) sends it from the CRM and marks it sent;
 *   Vistrial never sends it. "vistrial" means Vistrial performs it itself.
 * - recheck: what is checked again at the moment of performing.
 */

export type GatePerform = "person_sends" | "vistrial" | "answer";
export type GateRecheck = "opted_out" | "do_not_contact" | "lead_replied" | "expired" | "approver";

export type GateAction = {
  type: string;
  label: string;
  reachesPeople: boolean;
  perform: GatePerform;
  recheck: GateRecheck[];
};

const LEAD_RECHECKS: GateRecheck[] = ["opted_out", "do_not_contact", "lead_replied", "expired", "approver"];

export const GATE_ACTIONS: GateAction[] = [
  ...APPROVAL_ACTIONS.map((action): GateAction => ({
    type: action.value,
    label: action.label,
    reachesPeople: action.reachesPeople,
    perform: action.reachesPeople ? "person_sends" : "vistrial",
    recheck: action.reachesPeople ? LEAD_RECHECKS : ["approver"],
  })),
  { type: "agent_question", label: "A question from an agent", reachesPeople: false, perform: "answer", recheck: ["approver"] },
];

const BY_TYPE = new Map(GATE_ACTIONS.map((action) => [action.type, action]));

/** Unknown action types are treated as reaching people: the safe default. */
export function gateAction(type: string): GateAction {
  return (
    BY_TYPE.get(type) ?? { type, label: type.replaceAll("_", " "), reachesPeople: true, perform: "person_sends", recheck: LEAD_RECHECKS }
  );
}

export function mayRunWithoutPerson(type: string, mode: string): boolean {
  return mode === "auto_run" && !gateAction(type).reachesPeople;
}

/** The request states every surface shows, in the shared vocabulary. */
export const REQUEST_STATES = ["waiting", "approved", "rejected", "expired", "withdrawn", "performing", "performed", "failed"] as const;
export type RequestState = (typeof REQUEST_STATES)[number];

const STORED_TO_STATE: Record<string, RequestState> = {
  pending: "waiting",
  approved: "approved",
  dismissed: "rejected",
  expired: "expired",
  withdrawn: "withdrawn",
  running: "performing",
  succeeded: "performed",
  failed: "failed",
};

export function requestState(stored: string): RequestState {
  return STORED_TO_STATE[stored] ?? "waiting";
}

export const REQUEST_STATE_LABEL: Record<RequestState, string> = {
  waiting: "Waiting for approval",
  approved: "Approved, ready to send from your CRM",
  rejected: "Rejected",
  expired: "Expired",
  withdrawn: "Withdrawn",
  performing: "In progress",
  performed: "Sent",
  failed: "Did not go through",
};

/** Waiting or approved-but-not-yet-sent: still needs a person. */
export function needsPerson(stored: string): boolean {
  const state = requestState(stored);
  return state === "waiting" || state === "approved";
}

/**
 * Who may approve, mirrored from gate_can_decide in the database (which is
 * what actually enforces it). Used only to decide what to show.
 */
export function canDecide(input: {
  rule: string;
  role: "owner" | "member" | "operator" | null;
  canApprove: boolean;
  isStaff: boolean;
  isAssigned: boolean;
  assignedSomeone: boolean;
}): boolean {
  if (input.isStaff) return true;
  if (input.role === "owner") return true;
  if (input.rule === "owner_only") return false;
  const approver = input.role === "member" && input.canApprove;
  if (!approver) return false;
  if (input.rule === "assigned") return input.isAssigned || !input.assignedSomeone;
  return true;
}
