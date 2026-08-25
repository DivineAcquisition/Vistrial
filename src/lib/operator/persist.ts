import "server-only";

import { getAuthContext } from "@/lib/auth/session";
import { OPERATOR_BATCH_CAP_DEFAULT, OPERATOR_BATCH_CAP_MAX, OPERATOR_BATCH_CAP_MIN } from "@/lib/operator/constants";
import { toolLabel } from "@/lib/operator/labels";
import type {
  OperatorBatchReport,
  OperatorChangeRecord,
  OperatorConfirmationView,
  OperatorRunStatus,
  OperatorRunSummary,
  OperatorRunView,
  OperatorStepState,
  OperatorStepView,
  OperatorUiList,
  OperatorWriteKind,
} from "@/lib/operator/types";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";
import { verifyAgentPlan } from "@/lib/verification/agent-verify";
import { asFaults } from "@/lib/verification/faults";

type Db = Awaited<ReturnType<typeof createClient>>;

function asRecord(value: Json | null | undefined): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseUi(value: Json | null): OperatorUiList | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const kind = rec.kind;
  if (kind !== "leads" && kind !== "calls" && kind !== "objections" && kind !== "touches" && kind !== "generic") {
    return null;
  }
  const rows = Array.isArray(rec.rows) ? (rec.rows as OperatorUiList["rows"]) : [];
  const links = Array.isArray(rec.links) ? (rec.links as OperatorUiList["links"]) : [];
  return { kind, rows, links };
}

function parseRecords(value: Json): OperatorChangeRecord[] {
  if (!Array.isArray(value)) return [];
  return value as OperatorChangeRecord[];
}

function parseReport(value: Json | null): OperatorBatchReport | null {
  const rec = asRecord(value);
  if (!rec) return null;
  return rec as unknown as OperatorBatchReport;
}

function mapStep(row: {
  id: string;
  seq: number;
  tool_name: string;
  label: string;
  arguments: Json;
  result: Json | null;
  result_summary: string | null;
  state: string;
  error_kind: string | null;
  error_text: string | null;
  ui: Json | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}): OperatorStepView {
  return {
    id: row.id,
    seq: row.seq,
    toolName: row.tool_name,
    label: row.label,
    arguments: row.arguments,
    result: row.result,
    resultSummary: row.result_summary,
    state: row.state as OperatorStepState,
    errorKind: row.error_kind,
    errorText: row.error_text,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    ui: parseUi(row.ui),
  };
}

function mapConfirmation(row: {
  id: string;
  run_id: string;
  step_id: string | null;
  tool_name: string;
  write_kind: string;
  reversible: boolean;
  irreversible_reason: string | null;
  record_count: number;
  records: Json;
  decision: string;
  decided_by: string | null;
  decided_at: string | null;
  execute_result: Json | null;
  undo_until: string | null;
  undone_at: string | null;
  undo_result: Json | null;
  created_at: string;
  verification_gate?: string | null;
  verification_faults?: Json | null;
}): OperatorConfirmationView {
  const gate = row.verification_gate === "question" ? "question" : "confirm";
  return {
    id: row.id,
    runId: row.run_id,
    stepId: row.step_id,
    toolName: row.tool_name,
    writeKind: row.write_kind as OperatorWriteKind,
    reversible: row.reversible,
    irreversibleReason: row.irreversible_reason,
    recordCount: row.record_count,
    records: parseRecords(row.records),
    decision: row.decision as OperatorConfirmationView["decision"],
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    executeResult: parseReport(row.execute_result),
    undoUntil: row.undo_until,
    undoneAt: row.undone_at,
    undoResult: parseReport(row.undo_result),
    createdAt: row.created_at,
    verificationGate: gate,
    verificationFaults: asFaults(row.verification_faults),
  };
}

export async function loadOrgBatchCap(db: Db, orgId: string): Promise<number> {
  const { data } = await db
    .from("organizations")
    .select("operator_agent_batch_cap")
    .eq("id", orgId)
    .maybeSingle();
  const cap = data?.operator_agent_batch_cap ?? OPERATOR_BATCH_CAP_DEFAULT;
  if (cap < OPERATOR_BATCH_CAP_MIN) return OPERATOR_BATCH_CAP_MIN;
  if (cap > OPERATOR_BATCH_CAP_MAX) return OPERATOR_BATCH_CAP_MAX;
  return cap;
}

export async function insertOperatorRun(input: {
  requestText: string;
}): Promise<{ id: string; orgId: string; memberId: string; userId: string } | { error: string }> {
  const ctx = await getAuthContext();
  const db = await createClient();
  const { data, error } = await db
    .from("operator_runs")
    .insert({
      org_id: ctx.org.id,
      member_id: ctx.member.id,
      user_id: ctx.user.id,
      request_text: input.requestText.trim(),
      status: "running",
    })
    .select("id, org_id, member_id, user_id")
    .maybeSingle();
  if (error || !data) return { error: "Could not start that run." };
  return { id: data.id, orgId: data.org_id, memberId: data.member_id, userId: data.user_id };
}

export async function requireOwnedRun(runId: string) {
  const ctx = await getAuthContext();
  const db = await createClient();
  const { data, error } = await db
    .from("operator_runs")
    .select("*")
    .eq("id", runId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (error || !data) return { ok: false as const, error: "That run is not in this workspace." };
  if (data.user_id !== ctx.user.id) {
    return { ok: false as const, error: "Only the person who started this run can continue it." };
  }
  return { ok: true as const, ctx, db, run: data };
}

export async function nextStepSeq(db: Db, runId: string): Promise<number> {
  const { data } = await db
    .from("operator_run_steps")
    .select("seq")
    .eq("run_id", runId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.seq ?? 0) + 1;
}

export async function insertRunningStep(input: {
  runId: string;
  orgId: string;
  seq: number;
  toolName: string;
  args: unknown;
}): Promise<string> {
  const db = await createClient();
  const { data, error } = await db
    .from("operator_run_steps")
    .insert({
      org_id: input.orgId,
      run_id: input.runId,
      seq: input.seq,
      tool_name: input.toolName,
      label: toolLabel(input.toolName),
      arguments: (input.args ?? {}) as Json,
      state: "running",
    })
    .select("id")
    .maybeSingle();
  if (error || !data) throw new Error("Could not record that step.");
  await db
    .from("operator_runs")
    .update({ step_count: input.seq })
    .eq("id", input.runId)
    .eq("org_id", input.orgId);
  return data.id;
}

export async function finishStep(input: {
  stepId: string;
  runId: string;
  orgId: string;
  state: OperatorStepState;
  summary: string;
  result: unknown;
  ui: OperatorUiList | null;
  errorKind?: string | null;
  errorText?: string | null;
  startedAt: number;
}): Promise<void> {
  const db = await createClient();
  await db
    .from("operator_run_steps")
    .update({
      state: input.state,
      result: (input.result ?? null) as Json,
      result_summary: input.summary,
      ui: (input.ui ?? null) as Json | null,
      error_kind: input.errorKind ?? null,
      error_text: input.errorText ?? null,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - input.startedAt,
    })
    .eq("id", input.stepId)
    .eq("run_id", input.runId)
    .eq("org_id", input.orgId);
}

export async function insertConfirmation(input: {
  orgId: string;
  runId: string;
  stepId: string;
  toolName: string;
  writeKind: OperatorWriteKind;
  reversible: boolean;
  irreversibleReason: string | null;
  records: OperatorChangeRecord[];
  executePayload: unknown;
}): Promise<OperatorConfirmationView> {
  const db = await createClient();
  const [{ data: run }, cap] = await Promise.all([
    db.from("operator_runs").select("request_text").eq("id", input.runId).eq("org_id", input.orgId).maybeSingle(),
    loadOrgBatchCap(db, input.orgId),
  ]);
  let gate: "confirm" | "question" = "confirm";
  let faults: ReturnType<typeof asFaults> = [];
  try {
    const verified = await verifyAgentPlan({
      orgId: input.orgId,
      runId: input.runId,
      requestText: run?.request_text ?? "",
      writeKind: input.writeKind,
      records: input.records,
      cap,
      permissionDeniedIds: [],
    });
    gate = verified.gate;
    faults = verified.faults;
  } catch {
    gate = "question";
    faults = [
      {
        code: "verifier_error",
        where: "plan",
        what: "Verification could not finish. Confirm only if this change matches the request.",
      },
    ];
  }
  const { data, error } = await db
    .from("operator_run_confirmations")
    .insert({
      org_id: input.orgId,
      run_id: input.runId,
      step_id: input.stepId,
      tool_name: input.toolName,
      write_kind: input.writeKind,
      reversible: input.reversible,
      irreversible_reason: input.irreversibleReason,
      record_count: input.records.length,
      records: input.records as unknown as Json,
      execute_payload: (input.executePayload ?? {}) as Json,
      decision: "pending",
      verification_gate: gate,
      verification_faults: faults as unknown as Json,
    })
    .select("*")
    .maybeSingle();
  if (error || !data) throw new Error("Could not record that proposed write.");
  return mapConfirmation(data);
}

export async function touchLeads(orgId: string, runId: string, leadIds: string[]): Promise<void> {
  const unique = [...new Set(leadIds.filter(Boolean))];
  if (unique.length === 0) return;
  const db = await createClient();
  await db.from("operator_run_leads").upsert(
    unique.map((leadId) => ({ org_id: orgId, run_id: runId, lead_id: leadId })),
    { onConflict: "run_id,lead_id", ignoreDuplicates: true }
  );
}

export async function updateRunState(input: {
  runId: string;
  orgId: string;
  status?: OperatorRunStatus;
  finalResponse?: string | null;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  stopReason?: string | null;
  messages?: unknown;
  followUpText?: string | null;
  followUpUsed?: boolean;
  finished?: boolean;
}): Promise<void> {
  const db = await createClient();
  const patch: Database["public"]["Tables"]["operator_runs"]["Update"] = {};
  if (input.status) patch.status = input.status;
  if (input.finalResponse !== undefined) patch.final_response = input.finalResponse;
  if (input.model !== undefined) patch.model = input.model;
  if (input.inputTokens !== undefined) patch.input_tokens = input.inputTokens;
  if (input.outputTokens !== undefined) patch.output_tokens = input.outputTokens;
  if (input.stopReason !== undefined) patch.stop_reason = input.stopReason;
  if (input.messages !== undefined) patch.messages = input.messages as Json;
  if (input.followUpText !== undefined) patch.follow_up_text = input.followUpText;
  if (input.followUpUsed !== undefined) patch.follow_up_used = input.followUpUsed;
  if (input.finished) patch.finished_at = new Date().toISOString();
  if (Object.keys(patch).length === 0) return;
  await db.from("operator_runs").update(patch).eq("id", input.runId).eq("org_id", input.orgId);
}

export async function addRunTokens(runId: string, orgId: string, input: number, output: number): Promise<void> {
  const db = await createClient();
  const { data } = await db
    .from("operator_runs")
    .select("input_tokens, output_tokens")
    .eq("id", runId)
    .eq("org_id", orgId)
    .maybeSingle();
  await db
    .from("operator_runs")
    .update({
      input_tokens: (data?.input_tokens ?? 0) + input,
      output_tokens: (data?.output_tokens ?? 0) + output,
    })
    .eq("id", runId)
    .eq("org_id", orgId);
}

export async function loadOperatorRunView(runId: string): Promise<OperatorRunView | null> {
  const ctx = await getAuthContext();
  const db = await createClient();
  const { data: run, error } = await db
    .from("operator_runs")
    .select("*")
    .eq("id", runId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (error || !run) return null;
  const [{ data: steps }, { data: confirmations }] = await Promise.all([
    db.from("operator_run_steps").select("*").eq("run_id", runId).order("seq", { ascending: true }),
    db.from("operator_run_confirmations").select("*").eq("run_id", runId).order("created_at", { ascending: true }),
  ]);
  return {
    id: run.id,
    orgId: run.org_id,
    memberId: run.member_id,
    userId: run.user_id,
    requestText: run.request_text,
    followUpText: run.follow_up_text,
    followUpUsed: run.follow_up_used,
    status: run.status as OperatorRunStatus,
    finalResponse: run.final_response,
    model: run.model,
    inputTokens: run.input_tokens,
    outputTokens: run.output_tokens,
    stepCount: run.step_count,
    stopReason: run.stop_reason,
    createdAt: run.created_at,
    finishedAt: run.finished_at,
    steps: (steps ?? []).map(mapStep),
    confirmations: (confirmations ?? []).map(mapConfirmation),
  };
}

export async function listOperatorRunSummaries(limit = 30): Promise<OperatorRunSummary[]> {
  const ctx = await getAuthContext();
  const db = await createClient();
  const { data } = await db
    .from("operator_runs")
    .select("id, request_text, status, created_at, finished_at, step_count")
    .eq("org_id", ctx.org.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((row) => ({
    id: row.id,
    requestText: row.request_text,
    status: row.status as OperatorRunStatus,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    stepCount: row.step_count,
  }));
}

export async function listOperatorRunsForLead(leadId: string): Promise<OperatorRunSummary[]> {
  const ctx = await getAuthContext();
  const db = await createClient();
  const { data: links } = await db
    .from("operator_run_leads")
    .select("run_id")
    .eq("org_id", ctx.org.id)
    .eq("lead_id", leadId);
  const ids = [...new Set((links ?? []).map((row) => row.run_id))];
  if (ids.length === 0) return [];
  const { data } = await db
    .from("operator_runs")
    .select("id, request_text, status, created_at, finished_at, step_count")
    .eq("org_id", ctx.org.id)
    .in("id", ids)
    .order("created_at", { ascending: false });
  return (data ?? []).map((row) => ({
    id: row.id,
    requestText: row.request_text,
    status: row.status as OperatorRunStatus,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    stepCount: row.step_count,
  }));
}

export async function recordUndoStep(input: {
  runId: string;
  orgId: string;
  confirmationId: string;
  report: OperatorBatchReport;
}): Promise<void> {
  const seq = await nextStepSeq(await createClient(), input.runId);
  const db = await createClient();
  await db.from("operator_run_steps").insert({
    org_id: input.orgId,
    run_id: input.runId,
    seq,
    tool_name: "undo_write",
    label: "Undoing a confirmed write",
    arguments: { confirmationId: input.confirmationId } as Json,
    result: input.report as unknown as Json,
    result_summary: `Undo: ${input.report.succeeded.length} reversed, ${input.report.failed.length} failed, ${input.report.notAttempted.length} not attempted.`,
    state: input.report.failed.length ? "failed" : "done",
    finished_at: new Date().toISOString(),
    duration_ms: 0,
  });
}

export async function countPendingConfirmations(runId: string): Promise<number> {
  const db = await createClient();
  const { count } = await db
    .from("operator_run_confirmations")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId)
    .eq("decision", "pending");
  return count ?? 0;
}
