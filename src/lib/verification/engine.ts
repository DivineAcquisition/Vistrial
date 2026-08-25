import type { BoundedAttemptResult } from "@/lib/verification/types";
import { VERIFICATION_MAX_ATTEMPTS } from "@/lib/verification/constants";
import type { DeterministicCheckResult, ModelVerifyResult, VerificationFault } from "@/lib/verification/types";

export type GenerateFn<T> = (attempt: number, previousFaults: VerificationFault[]) => Promise<T>;
export type DetFn<T> = (output: T) => DeterministicCheckResult;
export type ModelFn<T> = (output: T) => Promise<ModelVerifyResult>;

/**
 * Stage 1 det → regenerate without the verifier.
 * Stage 2 model only after det passes.
 * Two attempts, then flagged. Never a third loop.
 */
export async function runBoundedVerification<T>(args: {
  generate: GenerateFn<T>;
  deterministic: DetFn<T>;
  modelVerify: ModelFn<T>;
}): Promise<BoundedAttemptResult<T>> {
  let previous: VerificationFault[] = [];
  let last!: BoundedAttemptResult<T>;

  for (let attempt = 1; attempt <= VERIFICATION_MAX_ATTEMPTS; attempt += 1) {
    const output = await args.generate(attempt, previous);
    const det = args.deterministic(output);
    if (!det.ok) {
      last = {
        output,
        attempt,
        retryHappened: attempt > 1,
        finalState: "flagged",
        stageCaught: "deterministic",
        faults: det.faults,
        modelInvoked: false,
        verificationModel: null,
        inputTokens: 0,
        outputTokens: 0,
        skippedReason: "deterministic_failed",
      };
      if (attempt < VERIFICATION_MAX_ATTEMPTS) {
        previous = det.faults;
        continue;
      }
      return last;
    }

    const model = await args.modelVerify(output);
    if (model.faults.length === 0) {
      return {
        output,
        attempt,
        retryHappened: attempt > 1,
        finalState: "passed",
        stageCaught: "none",
        faults: [],
        modelInvoked: model.invoked,
        verificationModel: model.model,
        inputTokens: model.inputTokens,
        outputTokens: model.outputTokens,
        skippedReason: model.skippedReason,
      };
    }

    last = {
      output,
      attempt,
      retryHappened: attempt > 1,
      finalState: "flagged",
      stageCaught: "model",
      faults: model.faults,
      modelInvoked: model.invoked,
      verificationModel: model.model,
      inputTokens: model.inputTokens,
      outputTokens: model.outputTokens,
      skippedReason: model.skippedReason,
    };
    if (attempt < VERIFICATION_MAX_ATTEMPTS) {
      previous = model.faults;
      continue;
    }
    return last;
  }

  return last;
}
