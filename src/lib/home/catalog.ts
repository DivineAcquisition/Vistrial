import { SALES_AREA } from "@/lib/home/areas/sales";
import {
  APPROVAL_MODES,
  APPROVERS,
  type ActionTypeDefinition,
  type ApprovalMode,
  type Approver,
  type HomeArea,
  type QueueKindDefinition,
} from "@/lib/home/areas/types";
import type { OrgRole } from "@/types/database";

export { APPROVAL_MODES, APPROVERS, type ApprovalMode, type Approver };

/**
 * Every area the home screen knows about. Show-up, retention, and client
 * success are added here when they exist; nothing else on the page changes.
 */
export const HOME_AREAS: HomeArea[] = [SALES_AREA];

export const ACTION_TYPES: ActionTypeDefinition[] = HOME_AREAS.flatMap((area) => area.actionTypes);
export const QUEUE_KINDS: QueueKindDefinition[] = HOME_AREAS.flatMap((area) => area.queueKinds);

export const DEFAULT_APPROVER: Approver = "owners_and_managers";

export const APPROVAL_MODE_LABELS: Record<ApprovalMode, string> = {
  ask_first: "Ask first",
  auto_run: "Auto-run",
  off: "Off",
};

export const APPROVAL_MODE_HINTS: Record<ApprovalMode, string> = {
  ask_first: "Goes to the approval queue",
  auto_run: "Runs on its own and is logged",
  off: "Vistrial never does this",
};

export const APPROVER_LABELS: Record<Approver, string> = {
  owner_only: "Owner only",
  owners_and_managers: "Owners and managers",
  assigned: "Anyone assigned to that lead",
};

export const ACTION_GROUP_LABELS = {
  people: "Messages to leads and clients",
  internal: "Internal actions",
} as const;

export function isApprovalMode(value: unknown): value is ApprovalMode {
  return typeof value === "string" && (APPROVAL_MODES as readonly string[]).includes(value);
}

export function isApprover(value: unknown): value is Approver {
  return typeof value === "string" && (APPROVERS as readonly string[]).includes(value);
}

export function actionType(id: string): ActionTypeDefinition | null {
  return ACTION_TYPES.find((type) => type.id === id) ?? null;
}

export function queueKind(id: string): QueueKindDefinition | null {
  return QUEUE_KINDS.find((kind) => kind.id === id) ?? null;
}

/** A workspace's stored choice for one action type, if it made one. */
export type GateRow = { actionType: string; mode: string; approver: string };

export type GateChoice = { mode: ApprovalMode; approver: Approver; reachesPeople: boolean };

/**
 * What a workspace has chosen for an action type, falling back to the
 * catalog default. An action type the catalog does not know asks first and
 * is treated as reaching people: a new type never starts on its own.
 */
export function effectiveGate(rows: GateRow[], id: string): GateChoice {
  const definition = actionType(id);
  const row = rows.find((candidate) => candidate.actionType === id);
  return {
    mode: row && isApprovalMode(row.mode) ? row.mode : (definition?.defaultMode ?? "ask_first"),
    approver: row && isApprover(row.approver) ? row.approver : DEFAULT_APPROVER,
    reachesPeople: definition?.reachesPeople ?? true,
  };
}

/** Approval rules are configured by the Vistrial team. The database enforces the same rule. */
export function canEditApprovalGate(_role: OrgRole, isStaff: boolean): boolean {
  return isStaff;
}

/** Letting a message to real people send unreviewed asks the owner to confirm. */
export function needsAutoRunConfirmation(reachesPeople: boolean, from: ApprovalMode, to: ApprovalMode): boolean {
  return reachesPeople && to === "auto_run" && from !== "auto_run";
}

/**
 * Whether this person may approve an item. Owners and staff always may.
 * Operators never do. A member may when an owner has granted it and the
 * workspace's rule for this action lets more than owners decide. An item that
 * waited past the workspace's limit has been escalated and is the owner's
 * alone.
 */
export function canApproveItem(args: {
  approver: Approver;
  role: OrgRole;
  isStaff: boolean;
  canApprove?: boolean;
  memberId: string;
  assignedMemberId: string | null;
  escalated: boolean;
}): boolean {
  if (args.isStaff || args.role === "owner") return true;
  if (args.escalated) return false;
  const grantedMember = (args.role === "member" || args.role === "client_viewer") && Boolean(args.canApprove);
  if (!grantedMember) return false;
  if (args.approver === "owners_and_managers") return true;
  if (args.approver === "assigned") {
    return args.assignedMemberId !== null && args.assignedMemberId === args.memberId;
  }
  return false;
}

/** "Only owners and managers can approve this." Shown on read-only items. */
export function whoCanApprove(approver: Approver, escalated: boolean): string {
  if (escalated) return "This waited too long, so only an owner can approve it now.";
  if (approver === "owner_only") return "Only an owner can approve this.";
  if (approver === "owners_and_managers") return "Only owners and managers can approve this.";
  return "Only the person assigned to these leads, or an owner, can approve this.";
}

const LIMIT_FIELD_LABELS: Record<string, string> = {
  quiet_hours_start: "Quiet hours start",
  quiet_hours_end: "Quiet hours end",
  daily_send_limit_per_lead: "Messages per lead per day",
  queue_wait_limit_minutes: "Escalate after waiting",
};

function gateValue(field: string, value: string | null): string {
  if (value === null) return "—";
  if (field === "mode" && isApprovalMode(value)) return APPROVAL_MODE_LABELS[value];
  if (field === "approver" && isApprover(value)) return APPROVER_LABELS[value];
  if (field === "queue_wait_limit_minutes") {
    const hours = Number(value) / 60;
    return hours === 1 ? "1 hour" : `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hours`;
  }
  return value;
}

/** One line of the settings history, e.g. "No-show rebooking messages: Ask first → Auto-run". */
export function describeGateChange(change: {
  actionType: string | null;
  field: string;
  fromValue: string | null;
  toValue: string | null;
}): string {
  if (change.field === "reviewed") {
    return change.toValue === "skipped" ? "Skipped the setup step and kept the defaults" : "Finished the setup step";
  }
  const subject = change.actionType
    ? `${actionType(change.actionType)?.label ?? change.actionType}${change.field === "approver" ? ", who can approve" : ""}`
    : (LIMIT_FIELD_LABELS[change.field] ?? change.field);
  return `${subject}: ${gateValue(change.field, change.fromValue)} → ${gateValue(change.field, change.toValue)}`;
}
