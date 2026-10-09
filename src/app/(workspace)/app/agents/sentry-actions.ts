"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthContext } from "@/lib/auth/session";
import { isLeadId } from "@/lib/cases/filters";
import { createClient } from "@/lib/supabase/server";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function client() {
  return createClient().then((db) => db as unknown as SupabaseClient);
}

export async function previewSentryAction(watchFrom: string): Promise<Result<{ wouldAlert: number }>> {
  const ctx = await getAuthContext();
  const db = await client();
  const { data, error } = await db.rpc("set_sentry_mode", {
    p_org_id: ctx.org.id,
    p_mode: "practice",
    p_watch_from: watchFrom,
    p_preview: true,
  });
  if (error) return { ok: false, error: error.message.includes("owner") ? error.message : "Could not preview that." };
  return { ok: true, data: { wouldAlert: Number((data as { wouldAlert?: number } | null)?.wouldAlert ?? 0) } };
}

export async function setSentryModeAction(input: { mode: "off" | "practice" | "live"; watchFrom: string; confirmed: boolean }): Promise<Result<null>> {
  if (!input.confirmed) return { ok: false, error: "Confirm first." };
  const ctx = await getAuthContext();
  const db = await client();
  const { error } = await db.rpc("set_sentry_mode", {
    p_org_id: ctx.org.id,
    p_mode: input.mode,
    p_watch_from: input.watchFrom,
    p_preview: false,
  });
  if (error) return { ok: false, error: error.message.includes("owner") || error.message.includes("onboarding") ? error.message : "Could not change Sentry." };
  revalidatePath("/app/agents/sentry");
  return { ok: true, data: null };
}

export async function acknowledgeSentryAlert(input: { alertId: string; snoozeMinutes?: number }): Promise<Result<null>> {
  const ctx = await getAuthContext();
  if (ctx.workspaceRole === "member" && !ctx.isStaff) return { ok: false, error: "You can look, but you cannot answer alerts." };
  const db = await client();
  const minutes = Math.min(Math.max(input.snoozeMinutes ?? 0, 0), 240);
  const { error } = await db.rpc("acknowledge_sentry_alert", { p_alert_id: input.alertId, p_snooze_minutes: minutes });
  if (error) return { ok: false, error: error.code === "42501" ? "You can look, but you cannot answer alerts." : "Could not update that alert." };
  revalidatePath("/app/agents/sentry");
  return { ok: true, data: null };
}

export async function reassignFromAlert(input: { leadId: string; memberId: string }): Promise<Result<null>> {
  if (!isLeadId(input.leadId)) return { ok: false, error: "That lead is not in this workspace." };
  const { assignQueueLead } = await import("@/app/(workspace)/app/queue/actions");
  const result = await assignQueueLead({ leadId: input.leadId, setterId: input.memberId, closerId: null });
  if (!result.ok) return result;
  return { ok: true, data: null };
}
