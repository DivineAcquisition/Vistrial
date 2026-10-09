import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { LiveAgentId } from "@/lib/agents/roster";
import { resumeRun, type RunRecorder } from "@/lib/live/record";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * What happens to a run after a person decides on its request. Agents register
 * a continuation here (Relay sends through the approval gate, Scribe applies an
 * answer). Without one, the run records the decision and finishes.
 */

export type DecisionContext = {
  recorder: RunRecorder;
  orgId: string;
  runId: string;
  approved: boolean;
  who: string;
  answer: string | null;
  reason: string | null;
  simulated: boolean;
};

type Continuation = (context: DecisionContext) => Promise<void>;

const continuations = new Map<LiveAgentId, Continuation>();

export function registerDecisionContinuation(agentId: LiveAgentId, run: Continuation): void {
  continuations.set(agentId, run);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function simulatedContinuation(context: DecisionContext): Promise<void> {
  const { recorder, approved, who, answer } = context;
  if (!approved) {
    await recorder.finish({ status: "stopped", reason: `Rejected by ${who}. Nothing was sent.` });
    return;
  }
  if (answer) {
    const step = await recorder.step("Using your answer");
    await sleep(1200);
    await step.done({ detail: "Applied the answer to the case file." });
    await recorder.finish({ reason: `Answered by ${who}. Case file updated.` });
    return;
  }
  const sending = await recorder.step(`Approved by ${who}, sending now`);
  await sleep(1800);
  await sending.done({ detail: "Simulation: nothing left Vistrial." });
  await recorder.output({ kind: "note", title: "Marked sent (simulation, nothing left Vistrial)" });
  await recorder.finish({ reason: `Approved by ${who} and marked sent. This was a simulation.` });
}

export async function continueAfterDecision(input: {
  runId: string;
  orgId: string;
  approved: boolean;
  who: string;
  answer: string | null;
  reason: string | null;
}): Promise<void> {
  const db = getSupabaseAdmin() as unknown as SupabaseClient;
  const { data: run } = await db
    .from("agent_activity_runs")
    .select("agent_id, simulated, status")
    .eq("id", input.runId)
    .eq("org_id", input.orgId)
    .maybeSingle();
  if (!run) return;
  const recorder = await resumeRun(input.runId, input.orgId);
  if (!recorder) return;

  await db
    .from("agent_activity_runs")
    .update({ status: "working", needs_person: null, last_progress_at: new Date().toISOString() })
    .eq("id", input.runId)
    .eq("org_id", input.orgId);
  await db.from("agent_activity_events").insert({
    org_id: input.orgId,
    run_id: input.runId,
    agent_id: run.agent_id,
    kind: input.approved ? "approval_given" : "approval_rejected",
    label: input.approved
      ? input.answer
        ? `Answered by ${input.who}`
        : `Approved by ${input.who}`
      : `Rejected by ${input.who}${input.reason ? `: ${input.reason.slice(0, 200)}` : ""}`,
  });

  const context: DecisionContext = {
    recorder,
    orgId: input.orgId,
    runId: input.runId,
    approved: input.approved,
    who: input.who,
    answer: input.answer,
    reason: input.reason,
    simulated: run.simulated === true,
  };
  if (context.simulated) {
    await simulatedContinuation(context);
    return;
  }
  const next = continuations.get(run.agent_id as LiveAgentId);
  if (next) {
    await next(context);
    return;
  }
  await recorder.finish(
    input.approved
      ? { reason: input.answer ? `Answered by ${input.who}.` : `Approved by ${input.who}.` }
      : { status: "stopped", reason: `Rejected by ${input.who}.` }
  );
}
