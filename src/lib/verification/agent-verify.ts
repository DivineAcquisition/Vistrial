import "server-only";

import { AGENT_PLAN_VERIFIER_SYSTEM, agentPlanVerifierUser, checkAgentPlanDeterministic } from "@/lib/verification/agent-plan";
import { runModelVerifier } from "@/lib/verification/model";
import { persistBoundedVerification, taskVerificationEnabled } from "@/lib/verification/record";
import type { VerificationFault } from "@/lib/verification/types";
import type { OperatorChangeRecord, OperatorWriteKind } from "@/lib/operator/types";

export type AgentPlanGate = {
  gate: "confirm" | "question";
  faults: VerificationFault[];
};

/**
 * Before a write is shown for confirmation. Operator confirmation remains the gate.
 * Unresolved faults turn that confirmation into a question.
 */
export async function verifyAgentPlan(args: {
  orgId: string;
  runId: string;
  requestText: string;
  writeKind: OperatorWriteKind;
  records: OperatorChangeRecord[];
  cap: number;
  permissionDeniedIds: string[];
}): Promise<AgentPlanGate> {
  const proposed = {
    writeKind: args.writeKind,
    recordCount: args.records.length,
    cap: args.cap,
    records: args.records.map((row) => ({
      id: row.id,
      leadId: row.leadId,
      label: row.label,
    })),
    permissionDeniedIds: args.permissionDeniedIds,
  };

  const det = checkAgentPlanDeterministic(proposed);
  let faults = det.faults;
  let modelInvoked = false;
  let model: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let skippedReason: "disabled" | "deterministic_failed" | "reporting" | null = null;

  if (det.ok) {
    const enabled = await taskVerificationEnabled("agent_plan");
    if (!enabled) {
      skippedReason = "disabled";
    } else {
      const proposedForVerifier = JSON.stringify({
        writeKind: args.writeKind,
        recordCount: args.records.length,
        records: args.records.map((row) => ({
          id: row.id,
          leadId: row.leadId,
          label: row.label,
          fields: row.fields,
        })),
      });
      const modelResult = await runModelVerifier({
        system: AGENT_PLAN_VERIFIER_SYSTEM,
        user: agentPlanVerifierUser(args.requestText, proposedForVerifier),
        includeEmbarrassment: false,
      });
      faults = modelResult.faults;
      modelInvoked = modelResult.invoked;
      model = modelResult.model;
      inputTokens = modelResult.inputTokens;
      outputTokens = modelResult.outputTokens;
    }
  } else {
    skippedReason = "deterministic_failed";
  }

  const flagged = faults.length > 0;
  await persistBoundedVerification({
    orgId: args.orgId,
    task: "agent_plan",
    subjectType: "operator_confirmation",
    subjectId: args.runId,
    result: {
      output: proposed,
      attempt: 1,
      retryHappened: false,
      finalState: flagged ? "flagged" : "passed",
      stageCaught: det.ok ? (flagged ? "model" : "none") : "deterministic",
      faults,
      modelInvoked,
      verificationModel: model,
      inputTokens,
      outputTokens,
      skippedReason,
    },
  });

  return {
    gate: flagged ? "question" : "confirm",
    faults,
  };
}
