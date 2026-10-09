import "server-only";

import { registerDecisionContinuation } from "@/lib/live/decisions";
import { scribeDb } from "@/lib/scribe/store";

/**
 * After a person decides on a Scribe hold: approving releases the case file,
 * rejecting keeps it held. Nothing is sent either way.
 */
registerDecisionContinuation("scribe", async ({ recorder, orgId, runId, approved, who, answer }) => {
  const db = scribeDb();
  const { data: file } = await db
    .from("case_files")
    .select("id, review_reasons")
    .eq("org_id", orgId)
    .eq("last_run_id", runId)
    .maybeSingle();
  if (!approved) {
    await recorder.finish({ status: "stopped", reason: `Kept on hold by ${who}.` });
    return;
  }
  if (file) {
    const reasons = ((file as { review_reasons?: string[] }).review_reasons ?? []).length;
    await db
      .from("case_files")
      .update({ status: reasons ? "needs_review" : "ready", held_reason: null, updated_at: new Date().toISOString() })
      .eq("id", (file as { id: string }).id)
      .eq("org_id", orgId);
  }
  await recorder.finish({ reason: answer ? `Answered by ${who}. Case file released.` : `Released by ${who}. Case file is open again.` });
});
