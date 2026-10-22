"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { runConfirmed, undoRun } from "@/lib/actions/execute";
import { actionDef } from "@/lib/actions/registry";
import { getAuthContext } from "@/lib/auth/session";
import { isTeamManager, salesOsEnabled } from "@/lib/sales-os/flag";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true; message?: string } | { ok: false; message: string };

const RESULT_COPY: Record<string, string> = {
  not_supported: "That app cannot make this change yet. Nothing was changed.",
  not_connected: "The app this needs is not connected or needs attention. Nothing was changed.",
  no_linked_record: "This lead is not linked to a record in that app yet. Nothing was changed.",
  not_allowed: "The app turned the change down. Check its permissions.",
  not_found: "The record was not found in the app.",
  rate_limited: "The app is busy. Try again in a minute.",
  vendor_error: "The app did not respond as expected. Nothing was changed.",
  halted: "Agent writes are paused.",
  workspace_paused: "This workspace is paused.",
  missing_scope: "The app has not been given permission to make this change.",
};

function revalidateAll() {
  revalidatePath("/app/actions");
  revalidatePath("/app/approvals");
  revalidatePath("/app/command");
}

export async function setPolicyAction(action: string, mode: "suggest" | "do_and_log"): Promise<Result> {
  const ctx = await getAuthContext();
  if (!(await salesOsEnabled(ctx.org.id))) return { ok: false, message: "The Sales OS is not switched on for this workspace." };
  if (ctx.workspaceRole !== "owner") return { ok: false, message: "Only an Owner can change how actions run." };
  const def = actionDef(action);
  if (!def || def.tier !== "internal_write") return { ok: false, message: "Only changes inside your own tools can run without a check. Anything a lead or client sees always waits for approval." };
  if (mode !== "suggest" && mode !== "do_and_log") return { ok: false, message: "Pick Suggest or Do and log." };
  const db = (await createClient()) as unknown as SupabaseClient;
  const { error } = await db.rpc("set_action_policy", { p_org_id: ctx.org.id, p_action: action, p_mode: mode });
  if (error) return { ok: false, message: "That did not save. Try again." };
  revalidateAll();
  return { ok: true, message: mode === "suggest" ? `${def.label} now waits for a confirm.` : `${def.label} now runs and is logged.` };
}

/** action_run_decide checks the person and the lead. Only then does the server run it. */
export async function decideSuggestionAction(runId: string, decision: "confirm" | "dismiss"): Promise<Result> {
  const ctx = await getAuthContext();
  if (!(await salesOsEnabled(ctx.org.id))) return { ok: false, message: "The Sales OS is not switched on for this workspace." };
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data, error } = await db.rpc("action_run_decide", { p_run_id: runId, p_decision: decision });
  if (error) return { ok: false, message: "You cannot decide this one, or it is gone." };
  if (data !== "running") {
    revalidateAll();
    return { ok: true, message: data === "dismissed" ? "Dismissed." : "Someone already decided this one." };
  }
  const outcome = await runConfirmed(getSupabaseAdmin() as unknown as SupabaseClient, ctx.org.id, runId, ctx.member.id);
  revalidateAll();
  if (outcome.route === "done") return { ok: true, message: "Done and logged." };
  if (outcome.route === "failed") return { ok: false, message: RESULT_COPY[outcome.code] ?? RESULT_COPY.vendor_error };
  if (outcome.route === "blocked") return { ok: false, message: RESULT_COPY[outcome.reason] ?? "That cannot run right now." };
  return { ok: false, message: "That cannot run right now." };
}

export async function undoRunAction(runId: string): Promise<Result> {
  const ctx = await getAuthContext();
  if (!(await salesOsEnabled(ctx.org.id))) return { ok: false, message: "The Sales OS is not switched on for this workspace." };
  const db = (await createClient()) as unknown as SupabaseClient;
  // Row-level security limits an operator to runs on their own leads.
  const { data: visible } = await db.from("action_runs").select("id").eq("id", runId).eq("org_id", ctx.org.id).maybeSingle();
  if (!visible) return { ok: false, message: "That change is not yours to undo." };
  const allowed = ctx.workspaceRole === "owner" || ctx.isStaff || ctx.workspaceRole === "operator" || (await isTeamManager(ctx.org.id));
  if (!allowed) return { ok: false, message: "That change is not yours to undo." };
  const result = await undoRun(getSupabaseAdmin() as unknown as SupabaseClient, ctx.org.id, runId);
  revalidateAll();
  if (result.ok) return { ok: true, message: "Put back." };
  if (result.code === "not_reversible") return { ok: false, message: "That app does not let this change be put back." };
  return { ok: false, message: RESULT_COPY[result.code ?? ""] ?? "That could not be put back." };
}
