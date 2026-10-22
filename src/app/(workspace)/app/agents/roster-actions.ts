"use server";

import { revalidatePath } from "next/cache";

import { agentContract } from "@/lib/agents/contract";
import { loadAgentSummary } from "@/lib/agents/summary-load";
import type { AgentSummary } from "@/lib/agents/summary";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
type Rpc = { rpc: (fn: string, args: object) => Promise<{ data: unknown; error: { message: string; code?: string } | null }> };

const AGENT_ID = /^[a-z][a-z0-9_]{1,39}$/;
const MANAGERS = new Set(["owner", "service_team", "platform_admin"]);

function plain(error: { message: string; code?: string }, fallback: string): string {
  return error.code === "42501" || error.code === "22023" ? error.message : fallback;
}

/** The shared summary for the signed-in person, refreshed after live events. */
export async function fetchAgentSummaryAction(orgId: string): Promise<Result<AgentSummary>> {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || ctx.org.id !== orgId) return { ok: false, error: "This workspace is no longer open to you." };
  const summary = await loadAgentSummary(orgId).catch(() => null);
  return summary ? { ok: true, data: summary } : { ok: false, error: "Could not load the agents." };
}

function timeOf(iso: string | null | undefined, timeZone: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
}

/**
 * Run now. Only for agents the contract marks safe on demand, only for the
 * people who may pause them, and never past a pause, a billing hold, a
 * missing connection, the cooldown or the daily cap. It never sends anything:
 * whatever an agent drafts goes to the approval gate as usual.
 */
export async function runAgentNowAction(agentId: string): Promise<Result<{ message: string }>> {
  if (!AGENT_ID.test(agentId)) return { ok: false, error: "Unknown agent." };
  const ctx = await getAuthContext();
  if (!MANAGERS.has(ctx.workspaceRole)) return { ok: false, error: "Only the Owner or the Vistrial team can run an agent now." };
  const run = agentContract(agentId).quickActions.runNow;
  if (!run) return { ok: false, error: "This agent does not run on demand." };

  const admin = getSupabaseAdmin() as unknown as Rpc;
  const orgId = ctx.org.id;

  if (agentId === "relay") {
    const blocked = await admin.rpc("billing_blocks_cost", { p_org_id: orgId });
    if (blocked.error) return { ok: false, error: "Could not check billing. Try again." };
    if (blocked.data === true) return { ok: false, error: "Paused until the workspace billing is sorted. Nothing was drafted." };
  }
  const summary = await loadAgentSummary(orgId).catch(() => null);
  const row = summary?.agents.find((agent) => agent.id === agentId);
  if (!row || row.state === "locked" || row.state === "not_available") return { ok: false, error: "This agent is not on in this workspace." };
  if (row.state === "needs_setup" && row.setupStep) return { ok: false, error: `${row.setupStep.label} first.` };
  if (row.state !== "on") return { ok: false, error: "Turn this agent on first." };

  const claim = await admin.rpc("agent_run_now_claim", {
    p_org_id: orgId,
    p_agent_id: agentId,
    p_user_id: ctx.user.id,
    p_cooldown_minutes: run.cooldownMinutes,
    p_daily_cap: run.dailyCap,
  });
  if (claim.error) return { ok: false, error: "Could not start that. Try again." };
  const result = (claim.data ?? {}) as { ok?: boolean; reason?: string; by?: string; availableAt?: string };
  if (!result.ok) {
    const at = timeOf(result.availableAt, ctx.org.timezone);
    switch (result.reason) {
      case "cooldown":
        return { ok: false, error: at ? `It just ran. You can run it again at ${at}.` : "It just ran. Try again in a few minutes." };
      case "cap":
        return { ok: false, error: at ? `That is today's limit. It is available again at ${at}.` : "That is today's limit." };
      case "paused":
        return { ok: false, error: result.by === "vistrial" ? "Paused by the Vistrial team." : "This agent is paused. Resume it first." };
      default:
        return { ok: false, error: "This agent cannot run in this workspace right now." };
    }
  }

  let message: string;
  if (agentId === "assay") {
    const { error } = await admin.rpc("assay_request_workspace_rescore", { p_org_id: orgId, p_reason: "manual" });
    if (error) return { ok: false, error: "Could not start the re-score. Try again." };
    message = "Assay is re-scoring your open leads. It takes a minute or two.";
  } else if (agentId === "sentry") {
    const { runSentrySweep } = await import("@/lib/sentry/sweep");
    await runSentrySweep(getSupabaseAdmin(), { orgId });
    message = "Sentry checked your reply windows.";
  } else {
    const { data } = await admin.rpc("relay_bring_forward", { p_org_id: orgId });
    const count = Number(data ?? 0);
    message = count > 0 ? `Relay will draft ${count} waiting follow-up${count === 1 ? "" : "s"} within a minute.` : "Nothing is waiting for Relay right now.";
  }
  revalidatePath("/app", "layout");
  return { ok: true, data: { message } };
}

/**
 * Turn an agent on or off. The database checks the role and the plan: an
 * Owner turns it on directly; the Vistrial team's switch waits for the
 * Owner to confirm, and the Owner is told.
 */
export async function setAgentEnabledAction(agentId: string, on: boolean, withdrawOpen = false): Promise<Result<{ stage: string; withdrawn: number }>> {
  if (!AGENT_ID.test(agentId)) return { ok: false, error: "Unknown agent." };
  const ctx = await getAuthContext();
  if (ctx.isStaff && !on) {
    const { assertRecentAuth } = await import("@/lib/staff/mfa-check");
    await assertRecentAuth("/app/agents/library");
  }
  const db = (await createClient()) as unknown as Rpc;
  const { data, error } = await db.rpc("agent_set_enabled", {
    p_org_id: ctx.org.id,
    p_agent_id: agentId,
    p_on: on,
    p_withdraw_open: withdrawOpen,
  });
  if (error) return { ok: false, error: plain(error, "Could not change that. Try again.") };
  const result = data as { stage: string; withdrawn: number; action: string };
  if (result.action === "agent.enable_requested") {
    await notifyOwnersToConfirm(ctx.org.id, agentId).catch(() => undefined);
  }
  revalidatePath("/app", "layout");
  return { ok: true, data: { stage: result.stage, withdrawn: result.withdrawn } };
}

async function notifyOwnersToConfirm(orgId: string, agentId: string): Promise<void> {
  const { enqueueNotification } = await import("@/lib/notifications/enqueue");
  const admin = getSupabaseAdmin();
  const { data: agent } = await (admin as unknown as {
    from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: { name?: string } | null }> } } };
  })
    .from("agent_registry")
    .select("name")
    .eq("id", agentId)
    .maybeSingle();
  const name = agent?.name ?? "An agent";
  const { data: owners } = await admin.from("org_members").select("id, user_id").eq("org_id", orgId).eq("role", "owner").eq("active", true);
  for (const owner of owners ?? []) {
    if (!owner.user_id) continue;
    await enqueueNotification(admin, {
      orgId,
      eventType: "workspace_notice",
      channel: "email",
      recipientUserId: owner.user_id,
      recipientMemberId: owner.id,
      subjectIds: [],
      title: `${name} is waiting for your OK`,
      body: `The Vistrial team turned on ${name} for your workspace. It does nothing until you confirm.`,
      href: "/app/agents/library",
      dedupeKey: `agent_confirm:${orgId}:${agentId}:${owner.id}`,
    });
  }
}

export async function recordAgentInterestAction(
  target: { agentId?: string; areaId?: string },
  kind: "notify_me" | "request_access" | "early_access",
): Promise<Result<null>> {
  const agentId = target.agentId && AGENT_ID.test(target.agentId) ? target.agentId : null;
  const areaId = target.areaId && AGENT_ID.test(target.areaId) ? target.areaId : null;
  if ((agentId === null) === (areaId === null)) return { ok: false, error: "Unknown agent." };
  const ctx = await getAuthContext();
  const db = (await createClient()) as unknown as Rpc;
  const { error } = await db.rpc("agent_record_interest", { p_org_id: ctx.org.id, p_agent_id: agentId, p_area_id: areaId, p_kind: kind });
  if (error) return { ok: false, error: plain(error, "Could not save that. Try again.") };
  revalidatePath("/app/agents/library");
  return { ok: true, data: null };
}

/** Hide or show a row in this person's own sidebar. The agent keeps running. */
export async function setAgentHiddenAction(agentId: string, hidden: boolean): Promise<Result<null>> {
  if (!AGENT_ID.test(agentId)) return { ok: false, error: "Unknown agent." };
  const ctx = await getAuthContext();
  if (ctx.workspaceRole !== "owner") return { ok: false, error: "Only the Owner can hide agents from their sidebar." };
  const db = (await createClient()) as unknown as {
    from: (t: string) => {
      upsert: (row: object, options: object) => Promise<{ error: { message: string } | null }>;
      delete: () => { eq: (k: string, v: string) => { eq: (k: string, v: string) => { eq: (k: string, v: string) => Promise<{ error: { message: string } | null }> } } };
    };
  };
  const { error } = hidden
    ? await db.from("agent_hidden").upsert({ user_id: ctx.user.id, org_id: ctx.org.id, agent_id: agentId }, { onConflict: "user_id,org_id,agent_id" })
    : await db.from("agent_hidden").delete().eq("user_id", ctx.user.id).eq("org_id", ctx.org.id).eq("agent_id", agentId);
  if (error) return { ok: false, error: "Could not save that. Try again." };
  revalidatePath("/app", "layout");
  return { ok: true, data: null };
}

/** Vistrial staff switch the new sidebar on or off for one workspace. */
export async function setAgentSidebarAction(on: boolean): Promise<Result<null>> {
  const ctx = await getAuthContext();
  if (!ctx.isStaff) return { ok: false, error: "Only the Vistrial team can change this switch." };
  const db = (await createClient()) as unknown as Rpc;
  const { error } = await db.rpc("set_workspace_flag", { p_org_id: ctx.org.id, p_flag: "agent_sidebar", p_enabled: on });
  if (error) return { ok: false, error: plain(error, "Could not change that. Try again.") };
  revalidatePath("/app", "layout");
  return { ok: true, data: null };
}
