import "server-only";

import { refreshCaseFile } from "@/app/app/cases/actions";
import { refreshFollowUpReview } from "@/app/app/follow-ups/actions";
import { canAssignLeadTo } from "@/lib/auth/permissions";
import type { AuthContext } from "@/lib/auth/types";
import { isLeadId } from "@/lib/cases/filters";
import { batchCapDenied, classifyToolError, permissionDenied } from "@/lib/operator/errors";
import { isProposeToolName } from "@/lib/operator/catalog";
import { insertConfirmation } from "@/lib/operator/persist";
import { redactForAgent } from "@/lib/operator/redact";
import type {
  OperatorChangeRecord,
  OperatorWriteKind,
  ToolOutcome,
} from "@/lib/operator/types";
import { LEAD_STATUS_LABELS, MANUAL_LEAD_STATUSES } from "@/lib/leads/labels";
import {
  TOUCH_CHANNELS,
  TOUCH_DIRECTIONS,
  TOUCH_OUTCOMES,
} from "@/lib/queue/types";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asUuid(value: unknown): string | null {
  const text = asString(value);
  return text && isLeadId(text) ? text : null;
}

function asUuidList(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    const one = asUuid(value);
    return one ? [one] : null;
  }
  const ids = value.map(asUuid).filter((id): id is string => Boolean(id));
  return ids.length ? ids : null;
}

function asInt(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function memberName(
  members: Array<{ id: string; displayName: string }>,
  id: string | null
): string {
  if (!id) return "Unassigned";
  return members.find((member) => member.id === id)?.displayName ?? id;
}

function record(input: {
  id: string;
  leadId: string | null;
  label: string;
  href: string | null;
  fields: Array<{ field: string; before: string | null; after: string | null }>;
}): OperatorChangeRecord {
  return input;
}

async function proposeAssign(
  input: Record<string, unknown>,
  ctx: AuthContext,
  cap: number,
  runId: string,
  stepId: string
): Promise<ToolOutcome> {
  const leadIds = asUuidList(input.leadIds);
  if (!leadIds) {
    return { ok: false, kind: "failed", error: "Name the leads to assign.", summary: "Name the leads to assign.", leadIds: [] };
  }
  if (leadIds.length > cap) return batchCapDenied(leadIds.length, cap);
  const setterId = input.setterId === null ? null : asUuid(input.setterId);
  const closerId = input.closerId === null ? null : asUuid(input.closerId);
  if (input.setterId !== undefined && input.setterId !== null && setterId === null) {
    return { ok: false, kind: "failed", error: "That setter id is not usable.", summary: "That setter id is not usable.", leadIds: [] };
  }
  if (input.closerId !== undefined && input.closerId !== null && closerId === null) {
    return { ok: false, kind: "failed", error: "That closer id is not usable.", summary: "That closer id is not usable.", leadIds: [] };
  }

  const allowedSetter = canAssignLeadTo({
    role: ctx.role,
    actorMemberId: ctx.member.id,
    targetMemberId: setterId,
    isPlatformAdmin: ctx.isPlatformAdmin,
  });
  const allowedCloser = canAssignLeadTo({
    role: ctx.role,
    actorMemberId: ctx.member.id,
    targetMemberId: closerId,
    isPlatformAdmin: ctx.isPlatformAdmin,
  });
  if (!allowedSetter || !allowedCloser) {
    return permissionDenied("You can assign this lead to yourself, but not to someone else.");
  }

  const records: OperatorChangeRecord[] = [];
  const payloads: Array<{ leadId: string; setterId: string | null; closerId: string | null; beforeSetterId: string | null; beforeCloserId: string | null }> = [];
  for (const leadId of leadIds) {
    const file = await refreshCaseFile(leadId);
    if (!file) {
      return { ok: false, kind: "failed", error: "That lead is not in this workspace.", summary: "That lead is not in this workspace.", leadIds: [] };
    }
    const afterSetter = memberName(file.members, setterId);
    const afterCloser = memberName(file.members, closerId);
    if (setterId && afterSetter === setterId) {
      return { ok: false, kind: "failed", error: "The setter must be an active member of this workspace.", summary: "The setter must be an active member of this workspace.", leadIds: [] };
    }
    if (closerId && afterCloser === closerId) {
      return { ok: false, kind: "failed", error: "The closer must be an active member of this workspace.", summary: "The closer must be an active member of this workspace.", leadIds: [] };
    }
    records.push(
      record({
        id: leadId,
        leadId,
        label: file.lead.name,
        href: `/app/cases/${leadId}`,
        fields: [
          { field: "Setter", before: file.lead.assignedSetterName, after: afterSetter },
          { field: "Closer", before: file.lead.assignedCloserName, after: afterCloser },
        ],
      })
    );
    payloads.push({
      leadId,
      setterId,
      closerId,
      beforeSetterId: file.lead.assignedSetterId,
      beforeCloserId: file.lead.assignedCloserId,
    });
  }

  const confirmation = await insertConfirmation({
    orgId: ctx.org.id,
    runId,
    stepId,
    toolName: "propose_assign_leads",
    writeKind: "assign",
    reversible: true,
    irreversibleReason: null,
    records,
    executePayload: { kind: "assign", items: payloads },
  });
  return {
    ok: true,
    kind: "propose",
    summary: `Proposed assignment change for ${records.length} lead${records.length === 1 ? "" : "s"}. Waiting for confirmation. Nothing has changed yet.`,
    model: redactForAgent({
      pendingConfirmation: true,
      confirmationId: confirmation.id,
      recordCount: records.length,
      records,
    }),
    confirmation,
    leadIds,
  };
}

async function proposeLogOutcome(
  input: Record<string, unknown>,
  ctx: AuthContext,
  runId: string,
  stepId: string
): Promise<ToolOutcome> {
  const leadId = asUuid(input.leadId);
  const channel = asString(input.channel);
  const direction = asString(input.direction);
  const outcome = asString(input.outcome);
  if (!leadId || !channel || !direction || !outcome) {
    return { ok: false, kind: "failed", error: "A lead, channel, direction, and outcome are required.", summary: "A lead, channel, direction, and outcome are required.", leadIds: [] };
  }
  if (!(TOUCH_CHANNELS as readonly string[]).includes(channel) || !(TOUCH_DIRECTIONS as readonly string[]).includes(direction) || !(TOUCH_OUTCOMES as readonly string[]).includes(outcome)) {
    return { ok: false, kind: "failed", error: "That outcome is not one of the logged touch values.", summary: "That outcome is not one of the logged touch values.", leadIds: [] };
  }
  const file = await refreshCaseFile(leadId);
  if (!file) return { ok: false, kind: "failed", error: "That lead is not in this workspace.", summary: "That lead is not in this workspace.", leadIds: [] };
  const records = [
    record({
      id: leadId,
      leadId,
      label: file.lead.name,
      href: `/app/cases/${leadId}`,
      fields: [
        { field: "Last touch", before: file.lead.lastTouchAt, after: "Logged now" },
        { field: "Channel", before: null, after: channel },
        { field: "Direction", before: null, after: direction },
        { field: "Outcome", before: null, after: outcome },
      ],
    }),
  ];
  const confirmation = await insertConfirmation({
    orgId: ctx.org.id,
    runId,
    stepId,
    toolName: "propose_log_outcome",
    writeKind: "log_outcome",
    reversible: false,
    irreversibleReason: "Logged outcomes cannot be deleted. Confirm only if this touch happened.",
    records,
    executePayload: {
      kind: "log_outcome",
      leadId,
      channel,
      direction,
      outcome,
      note: asString(input.note),
    },
  });
  return {
    ok: true,
    kind: "propose",
    summary: `Proposed logging ${outcome} on ${file.lead.name}. Irreversible. Waiting for confirmation.`,
    model: redactForAgent({ pendingConfirmation: true, confirmationId: confirmation.id, records }),
    confirmation,
    leadIds: [leadId],
  };
}

async function proposeCreateNextAction(
  input: Record<string, unknown>,
  ctx: AuthContext,
  runId: string,
  stepId: string
): Promise<ToolOutcome> {
  const leadId = asUuid(input.leadId);
  const actionText = asString(input.actionText);
  if (!leadId || !actionText) {
    return { ok: false, kind: "failed", error: "Write the follow-on before proposing it.", summary: "Write the follow-on before proposing it.", leadIds: [] };
  }
  const file = await refreshCaseFile(leadId);
  if (!file) return { ok: false, kind: "failed", error: "That lead is not in this workspace.", summary: "That lead is not in this workspace.", leadIds: [] };
  const records = [
    record({
      id: leadId,
      leadId,
      label: file.lead.name,
      href: `/app/cases/${leadId}`,
      fields: [
        { field: "Next action", before: file.nextActions.find((row) => !row.completedAt)?.actionText ?? null, after: actionText },
        { field: "Due", before: null, after: asString(input.dueAt) },
      ],
    }),
  ];
  const confirmation = await insertConfirmation({
    orgId: ctx.org.id,
    runId,
    stepId,
    toolName: "propose_create_next_action",
    writeKind: "create_next_action",
    reversible: false,
    irreversibleReason: "There is no delete for a next action. Completing it is not an undo.",
    records,
    executePayload: { kind: "create_next_action", leadId, actionText, dueAt: asString(input.dueAt) },
  });
  return {
    ok: true,
    kind: "propose",
    summary: `Proposed a next action on ${file.lead.name}. Irreversible. Waiting for confirmation.`,
    model: redactForAgent({ pendingConfirmation: true, confirmationId: confirmation.id, records }),
    confirmation,
    leadIds: [leadId],
  };
}

async function proposeCompleteNextAction(
  input: Record<string, unknown>,
  ctx: AuthContext,
  runId: string,
  stepId: string
): Promise<ToolOutcome> {
  const leadId = asUuid(input.leadId);
  const nextActionId = asUuid(input.nextActionId);
  if (!leadId || !nextActionId) {
    return { ok: false, kind: "failed", error: "A lead and next action are required.", summary: "A lead and next action are required.", leadIds: [] };
  }
  const file = await refreshCaseFile(leadId);
  if (!file) return { ok: false, kind: "failed", error: "That lead is not in this workspace.", summary: "That lead is not in this workspace.", leadIds: [] };
  const action = file.nextActions.find((row) => row.id === nextActionId);
  if (!action) {
    return { ok: false, kind: "failed", error: "That next action is not on this lead.", summary: "That next action is not on this lead.", leadIds: [] };
  }
  const records = [
    record({
      id: nextActionId,
      leadId,
      label: `${file.lead.name}: ${action.actionText}`,
      href: `/app/cases/${leadId}`,
      fields: [{ field: "Completed", before: action.completedAt, after: "Now" }],
    }),
  ];
  const confirmation = await insertConfirmation({
    orgId: ctx.org.id,
    runId,
    stepId,
    toolName: "propose_complete_next_action",
    writeKind: "complete_next_action",
    reversible: false,
    irreversibleReason: "Completed next actions cannot be reopened.",
    records,
    executePayload: { kind: "complete_next_action", leadId, nextActionId },
  });
  return {
    ok: true,
    kind: "propose",
    summary: `Proposed completing a next action on ${file.lead.name}. Irreversible. Waiting for confirmation.`,
    model: redactForAgent({ pendingConfirmation: true, confirmationId: confirmation.id, records }),
    confirmation,
    leadIds: [leadId],
  };
}

async function proposeReassignNextAction(
  input: Record<string, unknown>,
  ctx: AuthContext,
  runId: string,
  stepId: string
): Promise<ToolOutcome> {
  const leadId = asUuid(input.leadId);
  const nextActionId = asUuid(input.nextActionId);
  const ownerMemberId = input.ownerMemberId === null ? null : asUuid(input.ownerMemberId);
  if (!leadId || !nextActionId) {
    return { ok: false, kind: "failed", error: "A lead and next action are required.", summary: "A lead and next action are required.", leadIds: [] };
  }
  const allowed = canAssignLeadTo({
    role: ctx.role,
    actorMemberId: ctx.member.id,
    targetMemberId: ownerMemberId,
    isPlatformAdmin: ctx.isPlatformAdmin,
  });
  if (!allowed) {
    return permissionDenied("You can assign this action to yourself, but not to someone else.");
  }
  const file = await refreshCaseFile(leadId);
  if (!file) return { ok: false, kind: "failed", error: "That lead is not in this workspace.", summary: "That lead is not in this workspace.", leadIds: [] };
  const action = file.nextActions.find((row) => row.id === nextActionId);
  if (!action) {
    return { ok: false, kind: "failed", error: "That next action is not on this lead.", summary: "That next action is not on this lead.", leadIds: [] };
  }
  const records = [
    record({
      id: nextActionId,
      leadId,
      label: `${file.lead.name}: ${action.actionText}`,
      href: `/app/cases/${leadId}`,
      fields: [
        {
          field: "Owner",
          before: action.ownerName,
          after: memberName(file.members, ownerMemberId),
        },
      ],
    }),
  ];
  const confirmation = await insertConfirmation({
    orgId: ctx.org.id,
    runId,
    stepId,
    toolName: "propose_reassign_next_action",
    writeKind: "reassign_next_action",
    reversible: true,
    irreversibleReason: null,
    records,
    executePayload: {
      kind: "reassign_next_action",
      leadId,
      nextActionId,
      ownerMemberId,
      beforeOwnerMemberId: action.ownerMemberId,
    },
  });
  return {
    ok: true,
    kind: "propose",
    summary: `Proposed reassigning a next action on ${file.lead.name}. Waiting for confirmation.`,
    model: redactForAgent({ pendingConfirmation: true, confirmationId: confirmation.id, records }),
    confirmation,
    leadIds: [leadId],
  };
}

async function proposeOverrideScore(
  input: Record<string, unknown>,
  ctx: AuthContext,
  runId: string,
  stepId: string
): Promise<ToolOutcome> {
  const leadId = asUuid(input.leadId);
  const reasoning = asString(input.reasoning);
  if (!leadId || !reasoning) {
    return { ok: false, kind: "failed", error: "A lead and reasoning are required.", summary: "A lead and reasoning are required.", leadIds: [] };
  }
  const file = await refreshCaseFile(leadId);
  if (!file) return { ok: false, kind: "failed", error: "That lead is not in this workspace.", summary: "That lead is not in this workspace.", leadIds: [] };
  const factors = {
    timeline: asInt(input.timeline),
    investment_capacity: asInt(input.investment_capacity),
    decision_authority: asInt(input.decision_authority),
    pain_severity: asInt(input.pain_severity),
  };
  const reversible = Boolean(file.score);
  const records = [
    record({
      id: leadId,
      leadId,
      label: file.lead.name,
      href: `/app/cases/${leadId}`,
      fields: [
        { field: "Score", before: file.score ? String(file.score.total) : null, after: "Recomputed from the factors below" },
        { field: "Timeline", before: file.score?.timeline != null ? String(file.score.timeline) : null, after: factors.timeline != null ? String(factors.timeline) : "unknown" },
        { field: "Investment", before: file.score?.investmentCapacity != null ? String(file.score.investmentCapacity) : null, after: factors.investment_capacity != null ? String(factors.investment_capacity) : "unknown" },
        { field: "Authority", before: file.score?.decisionAuthority != null ? String(file.score.decisionAuthority) : null, after: factors.decision_authority != null ? String(factors.decision_authority) : "unknown" },
        { field: "Pain", before: file.score?.painSeverity != null ? String(file.score.painSeverity) : null, after: factors.pain_severity != null ? String(factors.pain_severity) : "unknown" },
      ],
    }),
  ];
  const confirmation = await insertConfirmation({
    orgId: ctx.org.id,
    runId,
    stepId,
    toolName: "propose_override_score",
    writeKind: "override_score",
    reversible,
    irreversibleReason: reversible ? null : "This lead has no previous scored factors to restore.",
    records,
    executePayload: {
      kind: "override_score",
      leadId,
      reasoning,
      factors,
      before: file.score
        ? {
            timeline: file.score.timeline,
            investment_capacity: file.score.investmentCapacity,
            decision_authority: file.score.decisionAuthority,
            pain_severity: file.score.painSeverity,
          }
        : null,
    },
  });
  return {
    ok: true,
    kind: "propose",
    summary: reversible
      ? `Proposed a score override on ${file.lead.name}. Waiting for confirmation.`
      : `Proposed a score override on ${file.lead.name}. Irreversible. Waiting for confirmation.`,
    model: redactForAgent({ pendingConfirmation: true, confirmationId: confirmation.id, records, reversible }),
    confirmation,
    leadIds: [leadId],
  };
}

async function proposeResolveObjection(
  input: Record<string, unknown>,
  ctx: AuthContext,
  runId: string,
  stepId: string
): Promise<ToolOutcome> {
  const leadId = asUuid(input.leadId);
  const objectionId = asUuid(input.objectionId);
  const note = asString(input.note);
  if (!leadId || !objectionId || !note) {
    return { ok: false, kind: "failed", error: "A lead, objection, and note are required.", summary: "A lead, objection, and note are required.", leadIds: [] };
  }
  const file = await refreshCaseFile(leadId);
  if (!file) return { ok: false, kind: "failed", error: "That lead is not in this workspace.", summary: "That lead is not in this workspace.", leadIds: [] };
  const objection = file.objections.find((row) => row.id === objectionId);
  if (!objection) {
    return { ok: false, kind: "failed", error: "That objection is not on this lead.", summary: "That objection is not on this lead.", leadIds: [] };
  }
  const records = [
    record({
      id: objectionId,
      leadId,
      label: `${file.lead.name}: ${objection.type}`,
      href: `/app/cases/${leadId}`,
      fields: [
        { field: "Resolved", before: objection.resolved ? "Yes" : "No", after: "Yes" },
        { field: "Note", before: objection.resolvedNote, after: note },
      ],
    }),
  ];
  const confirmation = await insertConfirmation({
    orgId: ctx.org.id,
    runId,
    stepId,
    toolName: "propose_resolve_objection",
    writeKind: "resolve_objection",
    reversible: false,
    irreversibleReason: "Resolved objections cannot be reopened.",
    records,
    executePayload: { kind: "resolve_objection", leadId, objectionId, note },
  });
  return {
    ok: true,
    kind: "propose",
    summary: `Proposed resolving a ${objection.type} objection on ${file.lead.name}. Irreversible. Waiting for confirmation.`,
    model: redactForAgent({ pendingConfirmation: true, confirmationId: confirmation.id, records }),
    confirmation,
    leadIds: [leadId],
  };
}

async function proposeChangeStatus(
  input: Record<string, unknown>,
  ctx: AuthContext,
  runId: string,
  stepId: string
): Promise<ToolOutcome> {
  const leadId = asUuid(input.leadId);
  const status = asString(input.status);
  const note = asString(input.note);
  if (!leadId || !status || !note) {
    return { ok: false, kind: "failed", error: "A lead, status, and note are required.", summary: "A lead, status, and note are required.", leadIds: [] };
  }
  if (!(MANUAL_LEAD_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, kind: "failed", error: "Closed won follows a recorded payment. Pick another status.", summary: "Closed won follows a recorded payment. Pick another status.", leadIds: [] };
  }
  const file = await refreshCaseFile(leadId);
  if (!file) return { ok: false, kind: "failed", error: "That lead is not in this workspace.", summary: "That lead is not in this workspace.", leadIds: [] };
  const records = [
    record({
      id: leadId,
      leadId,
      label: file.lead.name,
      href: `/app/cases/${leadId}`,
      fields: [
        {
          field: "Status",
          before: LEAD_STATUS_LABELS[file.lead.status],
          after: LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_LABELS] ?? status,
        },
        { field: "Note", before: null, after: note },
      ],
    }),
  ];
  const confirmation = await insertConfirmation({
    orgId: ctx.org.id,
    runId,
    stepId,
    toolName: "propose_change_status",
    writeKind: "change_status",
    reversible: true,
    irreversibleReason: null,
    records,
    executePayload: {
      kind: "change_status",
      leadId,
      status,
      note,
      beforeStatus: file.lead.status,
    },
  });
  return {
    ok: true,
    kind: "propose",
    summary: `Proposed changing ${file.lead.name} to ${status}. Waiting for confirmation.`,
    model: redactForAgent({ pendingConfirmation: true, confirmationId: confirmation.id, records }),
    confirmation,
    leadIds: [leadId],
  };
}

async function proposeRegenerateFollowUp(
  input: Record<string, unknown>,
  ctx: AuthContext,
  runId: string,
  stepId: string
): Promise<ToolOutcome> {
  const draftId = asUuid(input.draftId);
  const instruction = asString(input.instruction);
  if (!draftId || !instruction) {
    return { ok: false, kind: "failed", error: "A draft and instruction are required.", summary: "A draft and instruction are required.", leadIds: [] };
  }
  const review = await refreshFollowUpReview(draftId);
  if (!review) {
    return { ok: false, kind: "failed", error: "That draft is not in this workspace.", summary: "That draft is not in this workspace.", leadIds: [] };
  }
  const records = [
    record({
      id: draftId,
      leadId: review.draft.leadId,
      label: `${review.lead.name} draft`,
      href: `/app/follow-ups/${draftId}`,
      fields: [
        { field: "Status", before: review.draft.status, after: "pending (regenerated, still unsent)" },
        { field: "Instruction", before: null, after: instruction },
      ],
    }),
  ];
  const confirmation = await insertConfirmation({
    orgId: ctx.org.id,
    runId,
    stepId,
    toolName: "propose_regenerate_follow_up",
    writeKind: "regenerate_follow_up",
    reversible: false,
    irreversibleReason: "Regenerating replaces the pending draft. It does not send, and the previous wording is not restored through this tool.",
    records,
    executePayload: { kind: "regenerate_follow_up", draftId, instruction, leadId: review.draft.leadId },
  });
  return {
    ok: true,
    kind: "propose",
    summary: `Proposed regenerating a pending draft for ${review.lead.name}. It will not send. Waiting for confirmation.`,
    model: redactForAgent({ pendingConfirmation: true, confirmationId: confirmation.id, records, sends: false }),
    confirmation,
    leadIds: [review.draft.leadId],
  };
}

export async function runProposeTool(input: {
  name: string;
  rawInput: unknown;
  ctx: AuthContext;
  cap: number;
  runId: string;
  stepId: string;
}): Promise<ToolOutcome> {
  if (!isProposeToolName(input.name)) {
    return { ok: false, kind: "failed", error: "That is not a write tool.", summary: "That is not a write tool.", leadIds: [] };
  }
  const args = input.rawInput && typeof input.rawInput === "object" && !Array.isArray(input.rawInput)
    ? (input.rawInput as Record<string, unknown>)
    : {};
  try {
    switch (input.name) {
      case "propose_assign_leads":
        return await proposeAssign(args, input.ctx, input.cap, input.runId, input.stepId);
      case "propose_log_outcome":
        return await proposeLogOutcome(args, input.ctx, input.runId, input.stepId);
      case "propose_create_next_action":
        return await proposeCreateNextAction(args, input.ctx, input.runId, input.stepId);
      case "propose_complete_next_action":
        return await proposeCompleteNextAction(args, input.ctx, input.runId, input.stepId);
      case "propose_reassign_next_action":
        return await proposeReassignNextAction(args, input.ctx, input.runId, input.stepId);
      case "propose_override_score":
        return await proposeOverrideScore(args, input.ctx, input.runId, input.stepId);
      case "propose_resolve_objection":
        return await proposeResolveObjection(args, input.ctx, input.runId, input.stepId);
      case "propose_change_status":
        return await proposeChangeStatus(args, input.ctx, input.runId, input.stepId);
      case "propose_regenerate_follow_up":
        return await proposeRegenerateFollowUp(args, input.ctx, input.runId, input.stepId);
    }
  } catch (error) {
    const classified = classifyToolError(error instanceof Error ? error.message : "Could not propose that write.");
    return { ok: false, kind: classified.kind, error: classified.error, summary: classified.error, leadIds: [] };
  }
}

export type OperatorWriteKindName = OperatorWriteKind;
