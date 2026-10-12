import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { runImportCaseFiles } from "@/lib/onboarding/case-files";
import { runImports } from "@/lib/onboarding/import";
import { deliverOnboardingEvents, sendOnboardingReminders } from "@/lib/onboarding/notify";
import { advanceSampleRuns } from "@/lib/onboarding/sample";

const RECENT_LIVE_MS = 14 * 86_400_000;

/**
 * Every five minutes: re-check every workspace still onboarding (so a stage
 * that stops being true moves back and the right people hear), move imports
 * and their case files on at their pace, finish sample tests, and send what
 * is waiting to be said.
 */
export async function runOnboarding(db: SupabaseClient): Promise<Record<string, unknown>> {
  const recent = new Date(Date.now() - RECENT_LIVE_MS).toISOString();
  const { data: open } = await db
    .from("workspace_onboarding_status")
    .select("org_id")
    .or(`phase.in.(setup,ready_for_review,activating,live),and(phase.eq.settled,settled_at.gt.${recent})`)
    .limit(2000);
  let refreshed = 0;
  for (const row of (open ?? []) as Array<{ org_id: string }>) {
    const { error } = await db.rpc("onboarding_refresh", { p_org_id: row.org_id });
    if (!error) refreshed += 1;
  }
  const imports = await runImports(db, 25_000).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "failed" }));
  const caseFiles = await runImportCaseFiles(db, 15_000).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "failed" }));
  const samples = await advanceSampleRuns(db).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "failed" }));
  const events = await deliverOnboardingEvents(db).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "failed" }));
  const reminders = await sendOnboardingReminders(db).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "failed" }));
  return { refreshed, imports, caseFiles, samples, events, reminders };
}
