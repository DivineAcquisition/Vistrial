import { checkDraftQuality, type QualityInput } from "@/lib/follow-up/quality";
import { fault, uniqueFaults } from "@/lib/verification/faults";
import type { DeterministicCheckResult } from "@/lib/verification/types";

/** Stage 1 for drafts — the existing quality check, unchanged. */
export function checkDraftDeterministic(input: QualityInput): DeterministicCheckResult {
  const result = checkDraftQuality(input);
  if (result.ok) return { ok: true, faults: [] };
  return {
    ok: false,
    faults: uniqueFaults(
      result.failures.map((item) => fault(item.type, item.type, item.detail))
    ),
  };
}

export const DRAFT_VERIFIER_SYSTEM = `You find faults in a follow-up draft. You do not approve. You do not praise. You were not shown how the draft was produced and you must not guess.

Given the extraction, the client's real message examples, the voice profile, and the draft, name what is wrong and where:
- anything asserted that the call does not support
- any commitment implied that was not made
- tone that does not match the client's real message examples
- anything a prospect could reasonably read as manipulative or presumptuous
- a next step that is vague where the call agreed something specific

Then answer one question: would sending this to a real prospect embarrass the business? If yes, set would_embarrass to true and say why.

Return JSON only:
{"faults":[{"code":"string","where":"string","what":"string"}],"would_embarrass":false,"embarrass_reason":null}
If you find nothing wrong, faults is empty. Do not add commentary. Verification never sends a message.`;

export function draftVerifierUser(args: {
  extractionJson: string;
  voiceJson: string;
  examplesJson: string;
  draftBody: string;
  draftSubject: string | null;
  channel: string;
}): string {
  return [
    `Channel: ${args.channel}`,
    args.draftSubject ? `Subject:\n${args.draftSubject}` : null,
    `Draft:\n${args.draftBody}`,
    `Extraction:\n${args.extractionJson}`,
    `Voice profile:\n${args.voiceJson}`,
    `Client message examples:\n${args.examplesJson}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
