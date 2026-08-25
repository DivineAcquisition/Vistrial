"use server";

import { getAuthContext } from "@/lib/auth/session";
import {
  cancelOperatorConfirmation,
  confirmOperatorConfirmation,
  undoOperatorConfirmation,
} from "@/lib/operator/execute";
import { listOperatorRunSummaries, listOperatorRunsForLead, loadOperatorRunView, recordUndoStep } from "@/lib/operator/persist";
import type { OperatorRunSummary, OperatorRunView } from "@/lib/operator/types";

export async function loadOperatorRunAction(runId: string): Promise<OperatorRunView | null> {
  return loadOperatorRunView(runId);
}

export async function listOperatorRunsAction(): Promise<OperatorRunSummary[]> {
  return listOperatorRunSummaries();
}

export async function listOperatorRunsForLeadAction(leadId: string): Promise<OperatorRunSummary[]> {
  return listOperatorRunsForLead(leadId);
}

export async function confirmOperatorWriteAction(input: {
  runId: string;
  confirmationId: string;
  selectedIds?: string[] | null;
}): Promise<
  | { ok: true; remainingPending: number; report: { succeeded: unknown[]; failed: unknown[]; notAttempted: unknown[] }; reversible: boolean; undoUntil: string | null }
  | { ok: false; error: string }
> {
  const ctx = await getAuthContext();
  const owned = await loadOperatorRunView(input.runId);
  if (!owned || owned.userId !== ctx.user.id) {
    return { ok: false, error: "Only the person who started this run can confirm a write." };
  }
  return confirmOperatorConfirmation({
    ctx,
    runId: input.runId,
    confirmationId: input.confirmationId,
    selectedIds: input.selectedIds ?? null,
  });
}

export async function cancelOperatorWriteAction(input: {
  runId: string;
  confirmationId: string;
}): Promise<{ ok: true; remainingPending: number } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  const owned = await loadOperatorRunView(input.runId);
  if (!owned || owned.userId !== ctx.user.id) {
    return { ok: false, error: "Only the person who started this run can cancel a write." };
  }
  return cancelOperatorConfirmation({
    ctx,
    runId: input.runId,
    confirmationId: input.confirmationId,
  });
}

export async function undoOperatorWriteAction(input: {
  runId: string;
  confirmationId: string;
}): Promise<{ ok: true; report: { succeeded: unknown[]; failed: unknown[]; notAttempted: unknown[] } } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  const owned = await loadOperatorRunView(input.runId);
  if (!owned || owned.userId !== ctx.user.id) {
    return { ok: false, error: "Only the person who started this run can undo a write." };
  }
  const result = await undoOperatorConfirmation({
    ctx,
    runId: input.runId,
    confirmationId: input.confirmationId,
  });
  if (result.ok) {
    await recordUndoStep({
      runId: input.runId,
      orgId: ctx.org.id,
      confirmationId: input.confirmationId,
      report: result.report,
    });
  }
  return result;
}
