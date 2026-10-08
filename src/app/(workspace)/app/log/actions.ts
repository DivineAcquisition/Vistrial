"use server";

import { getAuthContext } from "@/lib/auth/session";
import { writeQueueOutcome } from "@/lib/queue/log-outcome";
import type { LogOutcomeInput, QueueActionResult } from "@/lib/queue/types";
import { createClient } from "@/lib/supabase/server";

export async function logMobileOutcome(input: LogOutcomeInput): Promise<QueueActionResult> {
  return writeQueueOutcome({ ...input, queuedOffline: Boolean(input.queuedOffline) });
}

export async function markMobileTraining(
  kind: "session" | "walkthrough"
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_mobile_training", {
    p_org_id: ctx.org.id,
    p_kind: kind,
  });
  if (error) return { ok: false, error: "Could not record that step." };
  return { ok: true };
}
