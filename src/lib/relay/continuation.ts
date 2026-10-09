import "server-only";

import { registerDecisionContinuation } from "@/lib/live/decisions";

/**
 * After a person decides on a Relay draft. Approving does not send anything:
 * the run waits until someone sends it from the CRM and marks it sent.
 */
registerDecisionContinuation("relay", async ({ recorder, approved, who, reason }) => {
  if (!approved) {
    await recorder.finish({ status: "stopped", reason: `Rejected by ${who}${reason ? `: ${reason.slice(0, 200)}` : ""}. Nothing was sent.` });
    return;
  }
  const step = await recorder.step(`Approved by ${who}`);
  await step.done({ detail: "Waiting for someone to send it from the CRM and mark it sent. Vistrial does not send it." });
  await recorder.needPerson({
    kind: "approval",
    prompt: "Approved. Send it from your CRM, then mark it sent.",
    whoCanAct: "The approver or the person this lead is assigned to",
  });
});
