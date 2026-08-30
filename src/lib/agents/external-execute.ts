import "server-only";

import { observationBlocksExecution } from "@/lib/agents/approvals";
import {
  EXTERNAL_WRITE_ATTRIBUTION,
  externalWriteApp,
  isAllowlistedExternalWrite,
  isForbiddenExternalTarget,
  isReversibleExternalWrite,
} from "@/lib/agents/external";
import { agentWritesHalted } from "@/lib/agents/halt";
import { canApproveExternalWrite } from "@/lib/agents/approvals";
import { previewExternalWrite } from "@/lib/agents/preview";
import type { AgentHaltState, ExternalOperationId } from "@/lib/agents/types";
import { ghlRequest } from "@/lib/ghl/client";
import type { GhlDb } from "@/lib/ghl/tokens";

export type ExternalWriteInput = {
  operation: ExternalOperationId;
  orgId: string;
  leadId: string;
  recordLabel: string;
  before: string;
  after: string;
  contactId: string;
  opportunityId?: string | null;
  tag?: string;
  note?: string;
  fieldId?: string;
  fieldValue?: string;
  pipelineId?: string;
  stageId?: string;
  taskTitle?: string;
  assignedUserId?: string;
  monetaryValue?: number;
  calendarId?: string;
  startTime?: string;
  endTime?: string;
};

export async function executeAllowlistedExternalWrite(args: {
  db: GhlDb;
  halt: AgentHaltState;
  observationMode: boolean;
  namedHumanId: string | null;
  input: ExternalWriteInput;
}): Promise<{ ok: true; reversible: boolean } | { ok: false; error: string }> {
  if (!isAllowlistedExternalWrite(args.input.operation) || isForbiddenExternalTarget(args.input.operation)) {
    return { ok: false, error: "That write is not allowed." };
  }
  if (observationBlocksExecution(args.observationMode, "write_external")) {
    return { ok: false, error: "This agent is watching first. The change was recorded and not applied." };
  }
  const app = externalWriteApp(args.input.operation);
  if (agentWritesHalted(args.halt, app)) {
    return {
      ok: false,
      error: app === "crm"
        ? "Agent writes to the CRM are stopped. The connection is still up."
        : "Agent writes to the calendar are stopped. The connection is still up.",
    };
  }
  const preview = previewExternalWrite({
    operation: args.input.operation,
    system: app,
    recordLabel: args.input.recordLabel,
    before: args.input.before,
    after: args.input.after,
    reversible: isReversibleExternalWrite(args.input.operation),
  });
  const approved = canApproveExternalWrite({ preview, namedHumanId: args.namedHumanId });
  if (!approved.ok) return { ok: false, error: approved.reason };

  const attributed = `${EXTERNAL_WRITE_ATTRIBUTION}: ${args.input.note ?? args.input.after}`;
  const contact = args.input.contactId;
  let result: { ok: boolean };

  switch (args.input.operation) {
    case "crm.add_tag":
      result = await ghlRequest(args.db, args.input.orgId, `/contacts/${encodeURIComponent(contact)}/tags`, {
        method: "POST",
        body: JSON.stringify({ tags: [args.input.tag] }),
      });
      break;
    case "crm.write_note":
      result = await ghlRequest(args.db, args.input.orgId, `/contacts/${encodeURIComponent(contact)}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: attributed }),
      });
      break;
    case "crm.update_allowlisted_field":
      result = await ghlRequest(args.db, args.input.orgId, `/contacts/${encodeURIComponent(contact)}`, {
        method: "PUT",
        body: JSON.stringify({
          customFields: [{ id: args.input.fieldId, field_value: args.input.fieldValue }],
        }),
      });
      break;
    case "crm.move_pipeline_stage":
      if (!args.input.opportunityId) return { ok: false, error: "That opportunity is missing." };
      result = await ghlRequest(
        args.db,
        args.input.orgId,
        `/opportunities/${encodeURIComponent(args.input.opportunityId)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            pipelineId: args.input.pipelineId,
            pipelineStageId: args.input.stageId,
          }),
        },
      );
      break;
    case "crm.create_task":
      result = await ghlRequest(args.db, args.input.orgId, `/contacts/${encodeURIComponent(contact)}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title: `${EXTERNAL_WRITE_ATTRIBUTION}: ${args.input.taskTitle ?? args.input.after}`,
          assignedTo: args.input.assignedUserId,
        }),
      });
      break;
    case "crm.update_opportunity_value":
      if (!args.input.opportunityId) return { ok: false, error: "That opportunity is missing." };
      result = await ghlRequest(
        args.db,
        args.input.orgId,
        `/opportunities/${encodeURIComponent(args.input.opportunityId)}`,
        {
          method: "PUT",
          body: JSON.stringify({ monetaryValue: args.input.monetaryValue }),
        },
      );
      break;
    case "calendar.create_hold":
      result = await ghlRequest(args.db, args.input.orgId, "/calendars/events", {
        method: "POST",
        body: JSON.stringify({
          title: `${EXTERNAL_WRITE_ATTRIBUTION} hold`,
          calendarId: args.input.calendarId,
          startTime: args.input.startTime,
          endTime: args.input.endTime,
          assignedUserId: args.input.assignedUserId,
        }),
      });
      break;
  }

  if (!result.ok) return { ok: false, error: "The connected system did not accept that change." };
  return { ok: true, reversible: isReversibleExternalWrite(args.input.operation) };
}

export async function undoAllowlistedExternalWrite(args: {
  db: GhlDb;
  orgId: string;
  operation: ExternalOperationId;
  contactId: string;
  opportunityId?: string | null;
  tag?: string;
  fieldId?: string;
  beforeValue?: string;
  pipelineId?: string;
  beforeStageId?: string;
  beforeValueNumber?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isReversibleExternalWrite(args.operation)) {
    return { ok: false, error: "This change cannot be undone from Vistrial." };
  }
  let result: { ok: boolean };
  switch (args.operation) {
    case "crm.add_tag":
      result = await ghlRequest(args.db, args.orgId, `/contacts/${encodeURIComponent(args.contactId)}/tags`, {
        method: "POST",
        body: JSON.stringify({ tags: [] }),
      });
      break;
    case "crm.update_allowlisted_field":
      result = await ghlRequest(args.db, args.orgId, `/contacts/${encodeURIComponent(args.contactId)}`, {
        method: "PUT",
        body: JSON.stringify({
          customFields: [{ id: args.fieldId, field_value: args.beforeValue }],
        }),
      });
      break;
    case "crm.move_pipeline_stage":
      if (!args.opportunityId) return { ok: false, error: "That opportunity is missing." };
      result = await ghlRequest(args.db, args.orgId, `/opportunities/${encodeURIComponent(args.opportunityId)}`, {
        method: "PUT",
        body: JSON.stringify({ pipelineId: args.pipelineId, pipelineStageId: args.beforeStageId }),
      });
      break;
    case "crm.update_opportunity_value":
      if (!args.opportunityId) return { ok: false, error: "That opportunity is missing." };
      result = await ghlRequest(args.db, args.orgId, `/opportunities/${encodeURIComponent(args.opportunityId)}`, {
        method: "PUT",
        body: JSON.stringify({ monetaryValue: args.beforeValueNumber }),
      });
      break;
    default:
      return { ok: false, error: "This change cannot be undone from Vistrial." };
  }
  if (!result.ok) return { ok: false, error: "The connected system did not accept the undo." };
  return { ok: true };
}
