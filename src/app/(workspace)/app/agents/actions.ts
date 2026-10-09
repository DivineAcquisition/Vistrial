"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";

import { getAuthContext } from "@/lib/auth/session";
import { isLiveAgentId } from "@/lib/agents/roster";
import { loadAwaySummary, loadLiveSince, loadRunDetail, type AwaySummary, type LiveSnapshot, type RunDetail } from "@/lib/live/load";
import { continueAfterDecision } from "@/lib/live/decisions";
import { resumeRun } from "@/lib/live/record";
import { wordEditDistance } from "@/lib/follow-up/edit-distance";
import "@/lib/scribe/continuation";
import "@/lib/relay/continuation";
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

type Rpc = { rpc: (fn: string, args: object) => Promise<{ data: unknown; error: { message: string; code?: string } | null }> };
type GateResult = { state?: string; already?: boolean; by?: string | null; reason?: string | null };

const STATE_NOTE: Record<string, string> = {
  approved: "Already approved. It is ready to send from your CRM.",
  succeeded: "Already done.",
  dismissed: "Already rejected.",
  expired: "This expired before anyone decided.",
  withdrawn: "This was withdrawn.",
};

function gateError(error: { message: string; code?: string }): string {
  if (error.code === "42501" || error.code === "22023" || error.code === "P0002") return error.message;
  return "Could not save that. Try again.";
}

/**
 * The one decision path for agent requests, used by the panel, Home, the run
 * viewer, and record pages. It runs as the signed-in person through
 * gate_decide, so the database decides who may approve. First decision wins;
 * a second click anywhere gets a clear note instead.
 */
export async function decideAgentRequest(input: {
  itemId: string;
  decision: "approve" | "reject" | "answer";
  reason?: string;
  answer?: string;
  editedPreview?: string;
  editedSubject?: string;
}): Promise<Result<{ already?: string; state?: string }>> {
  if (!/^[0-9a-f-]{36}$/i.test(input.itemId)) return { ok: false, error: "Not found." };
  const ctx = await getAuthContext();
  const answer = input.answer?.trim().slice(0, 2000) || null;
  if (input.decision === "answer" && !answer) return { ok: false, error: "Write an answer first." };
  const db = (await createClient()) as unknown as Rpc & import("@supabase/supabase-js").SupabaseClient;

  const { data: item } = await db
    .from("approval_items")
    .select("id, run_id, agent_id")
    .eq("id", input.itemId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!item || !item.agent_id) return { ok: false, error: "Not found." };

  let editDistance: number | null = null;
  const edited = input.editedPreview?.trim() ? input.editedPreview.slice(0, 4000) : null;
  if (edited && input.decision === "approve") {
    const { data: draft } = await db.from("relay_drafts").select("body").eq("approval_item_id", input.itemId).maybeSingle();
    const original = (draft as { body?: string } | null)?.body;
    if (original) editDistance = wordEditDistance(original, edited);
  }

  const { data, error } = await db.rpc("gate_decide", {
    p_item_id: input.itemId,
    p_decision: input.decision,
    p_body: input.decision === "approve" ? edited : null,
    p_subject: input.decision === "approve" ? input.editedSubject?.trim().slice(0, 200) || null : null,
    p_reason: input.decision === "reject" ? input.reason?.trim().slice(0, 500) || null : null,
    p_answer: answer,
    p_edit_distance: editDistance,
  });
  if (error) return { ok: false, error: gateError(error) };
  const result = (data ?? {}) as GateResult;
  if (result.already) {
    const note = result.by ? `Already decided by ${result.by}.` : (STATE_NOTE[result.state ?? ""] ?? "Already decided.");
    return { ok: true, data: { already: note, state: result.state } };
  }
  if (result.state === "withdrawn" || result.state === "expired") {
    return { ok: true, data: { already: result.reason ? `Withdrawn: ${result.reason}` : (STATE_NOTE[result.state] ?? "Closed."), state: result.state } };
  }

  if (item.run_id) {
    const runId = String(item.run_id);
    const orgId = ctx.org.id;
    const who = ctx.member.displayName || "a person";
    const approved = input.decision !== "reject";
    after(() => continueAfterDecision({ runId, orgId, approved, who, answer, reason: input.reason ?? null }));
  }
  revalidatePath("/app/home");
  return { ok: true, data: { state: result.state } };
}

/** The person sent the approved message from the CRM. Runs as them; the database re-checks the lead first. */
export async function markRequestSentAction(itemId: string): Promise<Result<{ state: string; note?: string }>> {
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return { ok: false, error: "Not found." };
  const ctx = await getAuthContext();
  const db = (await createClient()) as unknown as Rpc & import("@supabase/supabase-js").SupabaseClient;
  const { data: item } = await db.from("approval_items").select("run_id").eq("id", itemId).eq("org_id", ctx.org.id).maybeSingle();
  const { data, error } = await db.rpc("gate_mark_sent", { p_item_id: itemId });
  if (error) return { ok: false, error: gateError(error) };
  const result = (data ?? {}) as GateResult;
  if (result.state === "withdrawn") return { ok: true, data: { state: "withdrawn", note: `Not marked sent: ${result.reason ?? "it no longer applies."}` } };
  if (result.already) return { ok: true, data: { state: "performed", note: "Already marked sent." } };
  const runId = (item as { run_id?: string | null } | null)?.run_id;
  if (runId) {
    const orgId = ctx.org.id;
    const who = ctx.member.displayName || "a person";
    after(async () => {
      const recorder = await resumeRun(runId, orgId);
      if (!recorder) return;
      const step = await recorder.step(`Sent from the CRM by ${who}`);
      await step.done({ detail: "Logged as a touch on the case file." });
      await recorder.finish({ reason: `Sent from the CRM by ${who}.` });
    });
  }
  revalidatePath("/app/home");
  return { ok: true, data: { state: "performed" } };
}

export async function withdrawRequestAction(itemId: string, reason?: string): Promise<Result<{ state: string }>> {
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return { ok: false, error: "Not found." };
  await getAuthContext();
  const db = (await createClient()) as unknown as Rpc;
  const { data, error } = await db.rpc("gate_withdraw", { p_item_id: itemId, p_reason: reason?.trim().slice(0, 300) || null });
  if (error) return { ok: false, error: gateError(error) };
  revalidatePath("/app/home");
  return { ok: true, data: { state: String((data as GateResult | null)?.state ?? "withdrawn") } };
}

export type RelayDraftView = {
  channel: "sms" | "email";
  status: string;
  body: string;
  subject: string | null;
  footer: string | null;
  facts: Array<{ key: string; label: string; value: string; source: string; quote: string | null; used: boolean }>;
  expiresAt: string;
  approvedAt: string | null;
};

/** The draft behind a Relay request, read through row level security as the signed-in person. */
export async function fetchRelayDraft(itemId: string): Promise<Result<RelayDraftView>> {
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return { ok: false, error: "Not found." };
  const ctx = await getAuthContext();
  const db = (await createClient()) as unknown as import("@supabase/supabase-js").SupabaseClient;
  const { data } = await db
    .from("relay_drafts")
    .select("channel, status, body, subject, footer, facts, final_body, final_subject, expires_at, approved_at")
    .eq("approval_item_id", itemId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!data) return { ok: false, error: "Not found." };
  const row = data as Record<string, unknown>;
  const facts = Array.isArray(row.facts) ? (row.facts as RelayDraftView["facts"]) : [];
  return {
    ok: true,
    data: {
      channel: row.channel === "email" ? "email" : "sms",
      status: String(row.status),
      body: String(row.final_body ?? row.body ?? ""),
      subject: (row.final_subject ?? row.subject ?? null) as string | null,
      footer: (row.footer ?? null) as string | null,
      facts: facts.slice(0, 30),
      expiresAt: String(row.expires_at),
      approvedAt: (row.approved_at ?? null) as string | null,
    },
  };
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

/** Platform Admin only. Runs Scribe on synthetic calls for one template; no workspace data is read. */
export async function runScribeQualityAction(template: string): Promise<Result<null>> {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) return { ok: false, error: "Only a Platform Admin can run the quality check." };
  const { QUALITY_TEMPLATES } = await import("@/lib/scribe/quality/samples");
  if (!(QUALITY_TEMPLATES as readonly string[]).includes(template)) return { ok: false, error: "Unknown template." };
  const { runScribeQuality } = await import("@/lib/scribe/quality/run");
  const userId = ctx.user.id;
  after(async () => {
    await runScribeQuality(template as (typeof QUALITY_TEMPLATES)[number], userId).catch(() => null);
    revalidatePath("/app/agents/simulator");
  });
  return { ok: true, data: null };
}

/** Platform Admin only. Runs Sentry's synthetic scenarios against one template and keeps the result. */
export async function runSentryQualityAction(template: string): Promise<Result<{ passed: boolean; failed: number }>> {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) return { ok: false, error: "Only a Platform Admin can run the scenario check." };
  const { runSentryQuality, SENTRY_QUALITY_TEMPLATES } = await import("@/lib/sentry/quality");
  if (!SENTRY_QUALITY_TEMPLATES.includes(template)) return { ok: false, error: "Unknown template." };
  const result = await runSentryQuality(template, ctx.user.id).catch(() => null);
  if (!result) return { ok: false, error: "The scenario check could not run. Try again." };
  revalidatePath("/app/agents/simulator");
  revalidatePath("/app/agents/response-health");
  return { ok: true, data: { passed: result.passed, failed: result.results.filter((row) => !row.passed).length } };
}
