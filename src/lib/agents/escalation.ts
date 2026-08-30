import type { ModelTier, WorkKind } from "@/lib/agents/types";

export type EscalationRecord = {
  orgId: string;
  agentId: string;
  runId: string;
  stepIndex: number;
  workKind: WorkKind;
  fromTier: ModelTier;
  toTier: ModelTier;
  reason: "verification_failed";
};

export function shouldEscalateAfterVerification(args: {
  declaredTier: ModelTier;
  escalateOnFailure: boolean;
  verificationPassed: boolean;
  alreadyEscalated: boolean;
}): boolean {
  return (
    args.declaredTier === "sonnet" &&
    args.escalateOnFailure &&
    !args.verificationPassed &&
    !args.alreadyEscalated
  );
}

export function escalationRate(escalations: number, steps: number): number {
  if (steps <= 0) return 0;
  return escalations / steps;
}
