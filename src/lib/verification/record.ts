import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { BoundedAttemptResult, VerificationRecordInput } from "@/lib/verification/types";
import type { Json } from "@/types/database";

function admin() {
  return getSupabaseAdmin();
}

export async function recordVerificationRun(input: VerificationRecordInput): Promise<string | null> {
  const { data, error } = await admin()
    .from("verification_runs")
    .insert({
      org_id: input.orgId,
      task: input.task,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      attempt: input.attempt,
      retry_happened: input.retryHappened,
      stage_caught: input.stageCaught,
      final_state: input.finalState,
      faults: input.faults as unknown as Json,
      model_invoked: input.modelInvoked,
      model: input.model,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      skipped_reason: input.skippedReason ?? null,
    })
    .select("id")
    .maybeSingle();
  if (error) return null;
  return data?.id ?? null;
}

export async function recordVerificationUsage(args: {
  orgId: string;
  runId: string | null;
  task: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  if (args.inputTokens === 0 && args.outputTokens === 0) return;
  await admin().from("verification_usage").insert({
    org_id: args.orgId,
    run_id: args.runId,
    task: args.task,
    model: args.model,
    input_tokens: args.inputTokens,
    output_tokens: args.outputTokens,
  });
}

export async function persistBoundedVerification<T>(
  args: Omit<VerificationRecordInput, "attempt" | "retryHappened" | "stageCaught" | "finalState" | "faults" | "modelInvoked" | "model" | "inputTokens" | "outputTokens" | "skippedReason"> & {
    result: BoundedAttemptResult<T>;
  }
): Promise<string | null> {
  const runId = await recordVerificationRun({
    orgId: args.orgId,
    task: args.task,
    subjectType: args.subjectType,
    subjectId: args.subjectId,
    attempt: args.result.attempt,
    retryHappened: args.result.retryHappened,
    stageCaught: args.result.stageCaught,
    finalState: args.result.finalState,
    faults: args.result.faults,
    modelInvoked: args.result.modelInvoked,
    model: args.result.verificationModel,
    inputTokens: args.result.inputTokens,
    outputTokens: args.result.outputTokens,
    skippedReason: args.result.skippedReason,
  });
  if (args.result.modelInvoked && args.result.verificationModel) {
    await recordVerificationUsage({
      orgId: args.orgId,
      runId,
      task: args.task,
      model: args.result.verificationModel,
      inputTokens: args.result.inputTokens,
      outputTokens: args.result.outputTokens,
    });
  }
  return runId;
}

export async function taskVerificationEnabled(task: string): Promise<boolean> {
  const { data } = await admin()
    .from("verification_task_settings")
    .select("enabled")
    .eq("task", task)
    .maybeSingle();
  if (!data) return true;
  return data.enabled !== false;
}
