import "server-only";

import {
  changeLeadStatus,
  reassignLeadNextAction,
  resolveLeadObjection,
} from "@/app/app/cases/actions";
import { regenerateFollowUp } from "@/app/app/follow-ups/actions";
import {
  assignQueueLead,
  completeQueueNextAction,
  createQueueFollowOn,
  logQueueOutcome,
} from "@/app/app/queue/actions";
import type { AuthContext } from "@/lib/auth/types";
import { OPERATOR_UNDO_WINDOW_MS } from "@/lib/operator/constants";
import { classifyToolError } from "@/lib/operator/errors";
import type { OperatorBatchReport, OperatorWriteKind } from "@/lib/operator/types";
import { overrideLeadScore } from "@/lib/scoring/override";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

function emptyReport(): OperatorBatchReport {
  return { succeeded: [], failed: [], notAttempted: [] };
}

function payloadOf(value: Json | null): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asItems(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object") : [];
}

async function executeAssign(payload: Record<string, unknown>, selected: Set<string> | null): Promise<OperatorBatchReport> {
  const report = emptyReport();
  const items = asItems(payload.items).filter((item) => {
    const id = str(item.leadId);
    return id && (!selected || selected.has(id));
  });
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const leadId = str(item.leadId);
    if (!leadId) continue;
    const result = await assignQueueLead({
      leadId,
      setterId: item.setterId === null ? null : str(item.setterId),
      closerId: item.closerId === null ? null : str(item.closerId),
    });
    if (result.ok) {
      report.succeeded.push({ id: leadId, label: leadId });
      continue;
    }
    report.failed.push({ id: leadId, label: leadId, error: result.error ?? "Could not complete that write." });
    report.notAttempted.push(
      ...items.slice(index + 1).flatMap((row) => {
        const id = str(row.leadId);
        return id ? [{ id, label: id }] : [];
      })
    );
    break;
  }
  return report;
}

async function undoAssign(payload: Record<string, unknown>, succeededIds: Set<string>): Promise<OperatorBatchReport> {
  const report = emptyReport();
  const items = asItems(payload.items).filter((item) => str(item.leadId) && succeededIds.has(String(item.leadId)));
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const leadId = str(item.leadId);
    if (!leadId) continue;
    const result = await assignQueueLead({
      leadId,
      setterId: item.beforeSetterId === null ? null : str(item.beforeSetterId),
      closerId: item.beforeCloserId === null ? null : str(item.beforeCloserId),
    });
    if (result.ok) {
      report.succeeded.push({ id: leadId, label: leadId });
      continue;
    }
    report.failed.push({ id: leadId, label: leadId, error: result.error ?? "Could not complete that write." });
    report.notAttempted.push(
      ...items.slice(index + 1).flatMap((row) => {
        const id = str(row.leadId);
        return id ? [{ id, label: id }] : [];
      })
    );
    break;
  }
  return report;
}

async function executeLogOutcome(payload: Record<string, unknown>): Promise<OperatorBatchReport> {
  const report = emptyReport();
  const leadId = str(payload.leadId);
  if (!leadId) return report;
  const result = await logQueueOutcome({
    leadId,
    channel: str(payload.channel) ?? "other",
    direction: str(payload.direction) ?? "outbound",
    outcome: str(payload.outcome) ?? "connected",
    note: str(payload.note) ?? undefined,
  });
  if (result.ok) report.succeeded.push({ id: leadId, label: leadId });
  else report.failed.push({ id: leadId, label: leadId, error: result.error });
  return report;
}

async function executeCreateNextAction(payload: Record<string, unknown>): Promise<OperatorBatchReport> {
  const report = emptyReport();
  const leadId = str(payload.leadId);
  if (!leadId) return report;
  const result = await createQueueFollowOn({
    leadId,
    actionText: str(payload.actionText) ?? "",
    dueAt: str(payload.dueAt),
  });
  if (result.ok) report.succeeded.push({ id: leadId, label: leadId });
  else report.failed.push({ id: leadId, label: leadId, error: result.error });
  return report;
}

async function executeCompleteNextAction(payload: Record<string, unknown>): Promise<OperatorBatchReport> {
  const report = emptyReport();
  const leadId = str(payload.leadId);
  const nextActionId = str(payload.nextActionId);
  if (!leadId || !nextActionId) return report;
  const result = await completeQueueNextAction({ leadId, nextActionId });
  if (result.ok) report.succeeded.push({ id: nextActionId, label: leadId });
  else report.failed.push({ id: nextActionId, label: leadId, error: result.error });
  return report;
}

async function executeReassignNextAction(payload: Record<string, unknown>): Promise<OperatorBatchReport> {
  const report = emptyReport();
  const leadId = str(payload.leadId);
  const nextActionId = str(payload.nextActionId);
  if (!leadId || !nextActionId) return report;
  const result = await reassignLeadNextAction({
    leadId,
    nextActionId,
    ownerMemberId: payload.ownerMemberId === null ? null : str(payload.ownerMemberId),
  });
  if (result.ok) report.succeeded.push({ id: nextActionId, label: leadId });
  else report.failed.push({ id: nextActionId, label: leadId, error: result.error });
  return report;
}

async function undoReassignNextAction(payload: Record<string, unknown>): Promise<OperatorBatchReport> {
  const report = emptyReport();
  const leadId = str(payload.leadId);
  const nextActionId = str(payload.nextActionId);
  if (!leadId || !nextActionId) return report;
  const result = await reassignLeadNextAction({
    leadId,
    nextActionId,
    ownerMemberId: payload.beforeOwnerMemberId === null ? null : str(payload.beforeOwnerMemberId),
  });
  if (result.ok) report.succeeded.push({ id: nextActionId, label: leadId });
  else report.failed.push({ id: nextActionId, label: leadId, error: result.error });
  return report;
}

async function executeOverrideScore(payload: Record<string, unknown>, undo = false): Promise<OperatorBatchReport> {
  const report = emptyReport();
  const leadId = str(payload.leadId);
  if (!leadId) return report;
  const factors = undo
    ? (payload.before as Record<string, unknown> | null)
    : (payload.factors as Record<string, unknown> | null);
  if (undo && !factors) {
    report.failed.push({ id: leadId, label: leadId, error: "This override cannot be undone." });
    return report;
  }
  const form = new FormData();
  form.set("lead_id", leadId);
  form.set("reasoning", undo ? "Undo of operator-agent score override within the undo window." : str(payload.reasoning) ?? "");
  const keys = ["timeline", "investment_capacity", "decision_authority", "pain_severity"] as const;
  for (const key of keys) {
    const value = factors?.[key];
    if (typeof value === "number") form.set(key, String(value));
  }
  const result = await overrideLeadScore(form);
  if (result.ok) report.succeeded.push({ id: leadId, label: leadId });
  else report.failed.push({ id: leadId, label: leadId, error: result.error });
  return report;
}

async function executeResolveObjection(payload: Record<string, unknown>): Promise<OperatorBatchReport> {
  const report = emptyReport();
  const leadId = str(payload.leadId);
  const objectionId = str(payload.objectionId);
  if (!leadId || !objectionId) return report;
  const result = await resolveLeadObjection({
    leadId,
    objectionId,
    note: str(payload.note) ?? "",
  });
  if (result.ok) report.succeeded.push({ id: objectionId, label: leadId });
  else report.failed.push({ id: objectionId, label: leadId, error: result.error });
  return report;
}

async function executeChangeStatus(payload: Record<string, unknown>, undo = false): Promise<OperatorBatchReport> {
  const report = emptyReport();
  const leadId = str(payload.leadId);
  if (!leadId) return report;
  const status = undo ? str(payload.beforeStatus) : str(payload.status);
  if (!status) {
    report.failed.push({ id: leadId, label: leadId, error: "No status to restore." });
    return report;
  }
  const result = await changeLeadStatus({
    leadId,
    status,
    note: undo ? "Undo of operator-agent status change within the undo window." : str(payload.note) ?? "",
  });
  if (result.ok) report.succeeded.push({ id: leadId, label: leadId });
  else report.failed.push({ id: leadId, label: leadId, error: result.error });
  return report;
}

async function executeRegenerate(payload: Record<string, unknown>): Promise<OperatorBatchReport> {
  const report = emptyReport();
  const draftId = str(payload.draftId);
  if (!draftId) return report;
  const result = await regenerateFollowUp({
    draftId,
    instruction: str(payload.instruction) ?? "",
  });
  if (result.ok) report.succeeded.push({ id: draftId, label: draftId });
  else report.failed.push({ id: draftId, label: draftId, error: result.error });
  return report;
}

export async function executeWriteKind(
  kind: OperatorWriteKind,
  payload: Record<string, unknown>,
  selectedIds: string[] | null
): Promise<OperatorBatchReport> {
  const selected = selectedIds ? new Set(selectedIds) : null;
  switch (kind) {
    case "assign":
      return executeAssign(payload, selected);
    case "log_outcome":
      return executeLogOutcome(payload);
    case "create_next_action":
      return executeCreateNextAction(payload);
    case "complete_next_action":
      return executeCompleteNextAction(payload);
    case "reassign_next_action":
      return executeReassignNextAction(payload);
    case "override_score":
      return executeOverrideScore(payload);
    case "resolve_objection":
      return executeResolveObjection(payload);
    case "change_status":
      return executeChangeStatus(payload);
    case "regenerate_follow_up":
      return executeRegenerate(payload);
  }
}

export async function undoWriteKind(
  kind: OperatorWriteKind,
  payload: Record<string, unknown>,
  succeededIds: string[]
): Promise<OperatorBatchReport> {
  const ids = new Set(succeededIds);
  switch (kind) {
    case "assign":
      return undoAssign(payload, ids);
    case "reassign_next_action":
      return undoReassignNextAction(payload);
    case "override_score":
      return executeOverrideScore(payload, true);
    case "change_status":
      return executeChangeStatus(payload, true);
    default:
      return {
        succeeded: [],
        failed: [{ id: kind, label: kind, error: "This write cannot be undone." }],
        notAttempted: [],
      };
  }
}

export async function confirmOperatorConfirmation(input: {
  ctx: AuthContext;
  runId: string;
  confirmationId: string;
  selectedIds: string[] | null;
}): Promise<
  | { ok: true; remainingPending: number; report: OperatorBatchReport; reversible: boolean; undoUntil: string | null }
  | { ok: false; error: string }
> {
  const db = await createClient();
  const { data: row, error } = await db
    .from("operator_run_confirmations")
    .select("*")
    .eq("id", input.confirmationId)
    .eq("run_id", input.runId)
    .eq("org_id", input.ctx.org.id)
    .maybeSingle();
  if (error || !row) return { ok: false, error: "That proposed write is not on this run." };
  if (row.decision !== "pending") return { ok: false, error: "That write was already decided." };

  const { loadOrgAgentSettings } = await import("@/lib/agents/persist");
  const settings = await loadOrgAgentSettings(db as never, input.ctx.org.id, "operator");
  if (settings.observationMode) {
    await db
      .from("operator_run_confirmations")
      .update({
        decision: "cancelled",
        decided_by: input.ctx.member.id,
        decided_at: new Date().toISOString(),
        execute_result: { succeeded: [], failed: [], notAttempted: [], observed: true } as unknown as Json,
      })
      .eq("id", row.id)
      .eq("run_id", input.runId);
    return { ok: false, error: "This agent is watching first. Nothing was changed." };
  }

  const records = Array.isArray(row.records) ? row.records : [];
  if (input.selectedIds) {
    const allowed = new Set(records.map((item) => (item && typeof item === "object" && "id" in item ? String((item as { id: unknown }).id) : "")));
    if (input.selectedIds.some((id) => !allowed.has(id))) {
      return { ok: false, error: "A confirmation can only include records that were previewed." };
    }
    if (input.selectedIds.length === 0) {
      return { ok: false, error: "Confirming nothing is a cancel." };
    }
  }

  const payload = payloadOf(row.execute_payload);
  let report: OperatorBatchReport;
  try {
    report = await executeWriteKind(row.write_kind as OperatorWriteKind, payload, input.selectedIds);
  } catch (cause) {
    const classified = classifyToolError(cause instanceof Error ? cause.message : "Could not execute that write.");
    return { ok: false, error: classified.error };
  }

  const decision = input.selectedIds && input.selectedIds.length < records.length ? "adjusted" : "confirmed";
  const undoUntil =
    row.reversible && report.succeeded.length > 0
      ? new Date(Date.now() + OPERATOR_UNDO_WINDOW_MS).toISOString()
      : null;

  await db
    .from("operator_run_confirmations")
    .update({
      decision,
      decided_by: input.ctx.member.id,
      decided_at: new Date().toISOString(),
      execute_result: report as unknown as Json,
      undo_until: undoUntil,
    })
    .eq("id", row.id)
    .eq("run_id", input.runId);

  const { count } = await db
    .from("operator_run_confirmations")
    .select("id", { count: "exact", head: true })
    .eq("run_id", input.runId)
    .eq("decision", "pending");

  return {
    ok: true,
    remainingPending: count ?? 0,
    report,
    reversible: row.reversible && report.succeeded.length > 0,
    undoUntil,
  };
}

export async function cancelOperatorConfirmation(input: {
  ctx: AuthContext;
  runId: string;
  confirmationId: string;
}): Promise<{ ok: true; remainingPending: number } | { ok: false; error: string }> {
  const db = await createClient();
  const { data: row, error } = await db
    .from("operator_run_confirmations")
    .select("id, decision")
    .eq("id", input.confirmationId)
    .eq("run_id", input.runId)
    .eq("org_id", input.ctx.org.id)
    .maybeSingle();
  if (error || !row) return { ok: false, error: "That proposed write is not on this run." };
  if (row.decision !== "pending") return { ok: false, error: "That write was already decided." };

  await db
    .from("operator_run_confirmations")
    .update({
      decision: "cancelled",
      decided_by: input.ctx.member.id,
      decided_at: new Date().toISOString(),
      execute_result: { succeeded: [], failed: [], notAttempted: [] } as unknown as Json,
    })
    .eq("id", row.id)
    .eq("run_id", input.runId);

  const { count } = await db
    .from("operator_run_confirmations")
    .select("id", { count: "exact", head: true })
    .eq("run_id", input.runId)
    .eq("decision", "pending");

  return { ok: true, remainingPending: count ?? 0 };
}

export async function undoOperatorConfirmation(input: {
  ctx: AuthContext;
  runId: string;
  confirmationId: string;
}): Promise<{ ok: true; report: OperatorBatchReport } | { ok: false; error: string }> {
  const db = await createClient();
  const { data: row, error } = await db
    .from("operator_run_confirmations")
    .select("*")
    .eq("id", input.confirmationId)
    .eq("run_id", input.runId)
    .eq("org_id", input.ctx.org.id)
    .maybeSingle();
  if (error || !row) return { ok: false, error: "That write is not on this run." };
  if (row.decision !== "confirmed" && row.decision !== "adjusted") {
    return { ok: false, error: "Only an executed write can be undone." };
  }
  if (!row.reversible) return { ok: false, error: "This write cannot be undone." };
  if (row.undone_at) return { ok: false, error: "This write was already undone." };
  if (!row.undo_until || new Date(row.undo_until).getTime() < Date.now()) {
    return { ok: false, error: "The undo window has closed." };
  }
  const executed = payloadOf(row.execute_result);
  const succeeded = Array.isArray(executed.succeeded)
    ? executed.succeeded.map((item) => (item && typeof item === "object" && "id" in item ? String((item as { id: unknown }).id) : "")).filter(Boolean)
    : [];
  const report = await undoWriteKind(row.write_kind as OperatorWriteKind, payloadOf(row.execute_payload), succeeded);
  await db
    .from("operator_run_confirmations")
    .update({
      undone_at: new Date().toISOString(),
      undo_result: report as unknown as Json,
    })
    .eq("id", row.id)
    .eq("run_id", input.runId);
  return { ok: true, report };
}
