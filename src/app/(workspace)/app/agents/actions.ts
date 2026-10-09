"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";

import { getAuthContext } from "@/lib/auth/session";
import { isLiveAgentId } from "@/lib/agents/roster";
import { loadAwaySummary, loadLiveSince, loadRunDetail, type AwaySummary, type LiveSnapshot, type RunDetail } from "@/lib/live/load";
import { continueAfterDecision } from "@/lib/live/decisions";
import "@/lib/scribe/continuation";
import { runSimulation, SIMULATION_SCENARIOS, type SimulationScenario } from "@/lib/live/simulator";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Result<T> = { ok: true; data: T } | { ok: false; error: string; lost?: boolean };

/** Fill a gap after a dropped connection. Returns lost when access is gone. */
export async function fetchLiveSince(orgId: string, sinceIso: string): Promise<Result<LiveSnapshot>> {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || ctx.org.id !== orgId || !ctx.memberships.some((m) => m.orgId === orgId)) {
    return { ok: false, error: "This workspace is no longer open to you.", lost: true };
  }
  const since = Number.isFinite(Date.parse(sinceIso)) ? sinceIso : new Date(Date.now() - 60_000).toISOString();
  return { ok: true, data: await loadLiveSince(orgId, since) };
}

export async function fetchRunDetail(runId: string): Promise<Result<RunDetail>> {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return { ok: false, error: "Not found." };
  const detail = await loadRunDetail(runId);
  if (!detail) return { ok: false, error: "Not found." };
  return { ok: true, data: detail };
}

export async function setAgentPausedAction(agentId: string, paused: boolean, reason?: string): Promise<Result<null>> {
  if (!isLiveAgentId(agentId)) return { ok: false, error: "Unknown agent." };
  const ctx = await getAuthContext();
  const db = await createClient();
  const { error } = await (db as unknown as { rpc: (fn: string, args: object) => Promise<{ error: { message: string } | null }> }).rpc(
    "set_agent_paused",
    { p_org_id: ctx.org.id, p_agent_id: agentId, p_paused: paused, p_reason: reason ?? null }
  );
  if (error) return { ok: false, error: error.message.includes("Only an owner") ? error.message : "Could not change that. Try again." };
  revalidatePath("/app/agents", "layout");
  return { ok: true, data: null };
}

export async function setCalmModeAction(on: boolean): Promise<Result<null>> {
  const ctx = await getAuthContext();
  const db = (await createClient()) as unknown as {
    from: (t: string) => { upsert: (v: object, o: object) => Promise<{ error: { message: string } | null }> };
  };
  const { error } = await db
    .from("user_preferences")
    .upsert({ user_id: ctx.user.id, calm_mode: on, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return { ok: false, error: "Could not save that setting." };
  return { ok: true, data: null };
}

/**
 * The one decision path for agent requests, used by the panel, Home, the run
 * viewer, and record pages. First decision wins: the update only applies to a
 * pending item, so a second click anywhere gets a clear note instead.
 */
export async function decideAgentRequest(input: {
  itemId: string;
  decision: "approve" | "reject" | "answer";
  reason?: string;
  answer?: string;
  editedPreview?: string;
}): Promise<Result<{ already?: string }>> {
  const ctx = await getAuthContext();
  const canApprove = ctx.isStaff || ctx.role === "owner" || ctx.member.canApprove;
  if (!canApprove) return { ok: false, error: "You are not set up to approve. An owner can grant this." };
  const admin = getSupabaseAdmin() as unknown as import("@supabase/supabase-js").SupabaseClient;

  const { data: item } = await admin
    .from("approval_items")
    .select("id, org_id, run_id, agent_id, status, decided_by_member_id, action_type, title")
    .eq("id", input.itemId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!item || !item.agent_id) return { ok: false, error: "Not found." };

  const now = new Date().toISOString();
  const approving = input.decision !== "reject";
  const answer = input.answer?.trim().slice(0, 2000) || null;
  if (input.decision === "answer" && !answer) return { ok: false, error: "Write an answer first." };
  const patch: Record<string, unknown> = approving
    ? { status: "succeeded", run_mode: "approved", decided_by_member_id: ctx.member.id, decided_at: now, answer_text: answer }
    : { status: "dismissed", decided_by_member_id: ctx.member.id, decided_at: now, dismiss_reason: input.reason?.trim().slice(0, 500) || null };
  if (input.editedPreview && approving) patch.preview = input.editedPreview.slice(0, 4000);

  const { data: updated } = await admin
    .from("approval_items")
    .update(patch)
    .eq("id", input.itemId)
    .eq("org_id", ctx.org.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (!updated) {
    const { data: decider } = item.decided_by_member_id
      ? await admin.from("org_members").select("display_name").eq("id", item.decided_by_member_id).maybeSingle()
      : { data: null };
    const name = (decider as { display_name?: string } | null)?.display_name;
    return { ok: true, data: { already: name ? `Already decided by ${name}.` : "Already decided." } };
  }

  await admin.rpc("log_workspace_activity", {
    p_actor_user_id: ctx.user.id,
    p_org_id: ctx.org.id,
    p_action: approving ? (input.decision === "answer" ? "agent.question_answered" : "agent.request_approved") : "agent.request_rejected",
    p_target_table: "approval_items",
    p_target_id: input.itemId,
    p_detail: { agent: item.agent_id, run: item.run_id, reason: input.reason ?? null },
  });

  if (item.run_id) {
    const runId = String(item.run_id);
    const orgId = ctx.org.id;
    const who = ctx.member.displayName || "a person";
    after(() => continueAfterDecision({ runId, orgId, approved: approving, who, answer, reason: input.reason ?? null }));
  }
  return { ok: true, data: {} };
}

export async function runSimulatorAction(scenario: string, agentId?: string): Promise<Result<null>> {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) return { ok: false, error: "Only a Platform Admin can use the simulator." };
  if (!(SIMULATION_SCENARIOS as readonly string[]).includes(scenario)) return { ok: false, error: "Unknown scenario." };
  const admin = getSupabaseAdmin() as unknown as import("@supabase/supabase-js").SupabaseClient;
  const { data: org } = await admin.from("organizations").select("is_test_workspace").eq("id", ctx.org.id).maybeSingle();
  if (!(org as { is_test_workspace?: boolean } | null)?.is_test_workspace) {
    return { ok: false, error: "The simulator only runs in a test workspace." };
  }
  const orgId = ctx.org.id;
  after(() =>
    runSimulation({
      orgId,
      scenario: scenario as SimulationScenario,
      agentId: isLiveAgentId(agentId) ? agentId : undefined,
      adminName: ctx.member.displayName || "Platform Admin",
      adminMemberId: ctx.member.id,
    })
  );
  return { ok: true, data: null };
}

export async function fetchAwaySummary(sinceIso: string): Promise<Result<AwaySummary>> {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return { ok: false, error: "Signed out." };
  const parsed = Date.parse(sinceIso);
  const floor = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const since = new Date(Number.isFinite(parsed) ? Math.max(parsed, floor) : Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return { ok: true, data: await loadAwaySummary(ctx.org.id, since) };
}

/** Platform Admin only. The database trigger refuses anyone else as well. */
export async function setTestWorkspaceAction(on: boolean): Promise<Result<null>> {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) return { ok: false, error: "Only a Platform Admin can change this." };
  const admin = getSupabaseAdmin() as unknown as import("@supabase/supabase-js").SupabaseClient;
  const { error } = await admin.from("organizations").update({ is_test_workspace: on }).eq("id", ctx.org.id);
  if (error) return { ok: false, error: "Could not change the test flag." };
  await admin.rpc("log_workspace_activity", {
    p_actor_user_id: ctx.user.id,
    p_org_id: ctx.org.id,
    p_action: on ? "workspace.test_flag_on" : "workspace.test_flag_off",
    p_target_table: "organizations",
    p_target_id: ctx.org.id,
    p_detail: {},
  });
  revalidatePath("/app/agents/simulator");
  return { ok: true, data: null };
}
