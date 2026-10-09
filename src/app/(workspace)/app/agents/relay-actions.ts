"use server";

import { revalidatePath } from "next/cache";

import { getAuthContext } from "@/lib/auth/session";
import { SEED_TEMPLATES } from "@/lib/config/seeds";
import { createClient } from "@/lib/supabase/server";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** The Vistrial team confirms the CRM's sender number or sending domain. The database checks it is staff. */
export async function setMessagingReadinessAction(item: "sender_number" | "sending_domain", confirmed: boolean): Promise<Result<null>> {
  if (item !== "sender_number" && item !== "sending_domain") return { ok: false, error: "Unknown item." };
  const ctx = await getAuthContext();
  if (!ctx.isStaff) return { ok: false, error: "Only the Vistrial team can confirm messaging setup." };
  const db = (await createClient()) as unknown as { rpc: (fn: string, args: object) => Promise<{ error: { message: string } | null }> };
  const { error } = await db.rpc("set_messaging_readiness", { p_org_id: ctx.org.id, p_item: item, p_confirmed: confirmed });
  if (error) return { ok: false, error: "Could not save that." };
  revalidatePath("/app/agents/relay");
  return { ok: true, data: null };
}

/** The Vistrial team puts a job that could not be drafted back in line. */
export async function retryRelayJobAction(jobId: string): Promise<Result<null>> {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return { ok: false, error: "Not found." };
  const ctx = await getAuthContext();
  if (!ctx.isStaff) return { ok: false, error: "Only the Vistrial team can retry Relay jobs." };
  const { retryRelayJob } = await import("@/lib/relay/run");
  const done = await retryRelayJob(ctx.org.id, jobId);
  if (!done) return { ok: false, error: "That job is no longer waiting for a retry." };
  revalidatePath("/app/agents/relay");
  return { ok: true, data: null };
}

/** Platform Admin only. Synthetic leads; no workspace data is read and nothing is sent. */
export async function runRelayQualityAction(template: string, withModel: boolean): Promise<Result<{ passed: boolean; failed: number }>> {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) return { ok: false, error: "Only a Platform Admin can run the quality check." };
  if (!SEED_TEMPLATES.some((row) => row.slug === template)) return { ok: false, error: "Unknown template." };
  const { runRelayQuality } = await import("@/lib/relay/quality-run");
  const result = await runRelayQuality(template, withModel === true, ctx.user.id).catch(() => null);
  if (!result) return { ok: false, error: "The quality check could not run. Try again." };
  revalidatePath("/app/agents/simulator");
  return { ok: true, data: { passed: result.passed, failed: result.results.filter((row) => !row.passed).length } };
}
