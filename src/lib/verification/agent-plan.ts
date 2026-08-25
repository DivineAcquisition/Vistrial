import { fault, uniqueFaults } from "@/lib/verification/faults";
import type { DeterministicCheckResult } from "@/lib/verification/types";

export type ProposedChange = {
  writeKind: string;
  recordCount: number;
  cap: number;
  records: Array<{ id: string; leadId: string | null; label: string }>;
  permissionDeniedIds: string[];
};

/**
 * Stage 1 before an agent write: count, cap, and permission. No model.
 */
export function checkAgentPlanDeterministic(plan: ProposedChange): DeterministicCheckResult {
  const faults = [];
  if (plan.recordCount > plan.cap) {
    faults.push(
      fault(
        "over_broad",
        "count",
        `Proposed ${plan.recordCount} records, which exceeds the batch cap of ${plan.cap}.`
      )
    );
  }
  if (plan.recordCount !== plan.records.length) {
    faults.push(
      fault("count_mismatch", "records", `Record count ${plan.recordCount} does not match the listed ${plan.records.length}.`)
    );
  }
  if (plan.permissionDeniedIds.length > 0) {
    faults.push(
      fault(
        "permission",
        "records",
        `The acting user cannot write ${plan.permissionDeniedIds.length} of the listed records.`
      )
    );
  }
  if (plan.records.some((row) => !row.id)) {
    faults.push(fault("shape", "records", "A proposed record is missing an id."));
  }
  return { ok: faults.length === 0, faults: uniqueFaults(faults) };
}

export const AGENT_PLAN_VERIFIER_SYSTEM = `You find faults in a proposed write. You do not approve. You do not praise. You were not shown the agent's reasoning and you must not guess.

Given only the original request and the concrete proposed change, name what is wrong:
- does this change match what was asked
- is anything included that the request did not cover
- is anything the request implied missing
- is any reference ambiguous enough that it should have been a question

Return JSON only: {"faults":[{"code":"string","where":"string","what":"string"}]}
If you find nothing wrong, return {"faults":[]}. Do not add commentary.`;

export function agentPlanVerifierUser(requestText: string, proposedJson: string): string {
  return `Original request:\n${requestText}\n\nProposed change:\n${proposedJson}`;
}
