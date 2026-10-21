"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { api } from "../../../../../convex/_generated/api";
import { isOutcomeMetric, isSectionId } from "../../../../../convex/homeRules";
import { parseAssayScore } from "@/lib/assay/view";
import { getAuthContext } from "@/lib/auth/session";
import { userConvex } from "@/lib/directory/commit";
import { localDate } from "@/lib/home/periods";
import { mapRun, type LiveRun } from "@/lib/live/model";
import { createClient } from "@/lib/supabase/server";
import { WORK_COPY } from "@/lib/workspace/voice";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function convex() {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) throw new Error("unavailable");
  return userConvex();
}

async function quietly(fn: () => Promise<unknown>): Promise<Result> {
  try {
    await fn();
    return { ok: true, data: null };
  } catch {
    return { ok: false, error: "That did not save. Try again." };
  }
}

export async function recordVisitAction(): Promise<Result> {
  const ctx = await getAuthContext();
  const now = Date.now();
  return quietly(async () => (await convex()).mutation(api.home.recordVisit, { workspaceId: ctx.org.id, day: localDate(new Date(now), ctx.org.timezone), now }));
}

export async function markBriefingSeenAction(): Promise<Result> {
  const ctx = await getAuthContext();
  return quietly(async () => (await convex()).mutation(api.home.markBriefingSeen, { workspaceId: ctx.org.id, day: localDate(new Date(), ctx.org.timezone) }));
}

export async function setSectionCollapsedAction(section: string, collapsed: boolean): Promise<Result> {
  if (!isSectionId(section)) return { ok: false, error: "Unknown section." };
  const ctx = await getAuthContext();
  return quietly(async () => (await convex()).mutation(api.home.setCollapsed, { workspaceId: ctx.org.id, section, collapsed }));
}

export async function setWorkViewAction(view: { order?: "best" | "oldest"; scope?: "mine" | "everyone" }): Promise<Result> {
  const ctx = await getAuthContext();
  if (view.scope === "everyone" && ctx.workspaceRole === "operator") return { ok: false, error: "Not available." };
  const result = await quietly(async () => (await convex()).mutation(api.home.setWorkView, { workspaceId: ctx.org.id, ...view }));
  revalidatePath("/app/home");
  revalidatePath("/app/today");
  return result;
}

export async function dismissWelcomeAction(): Promise<Result> {
  const ctx = await getAuthContext();
  const result = await quietly(async () => (await convex()).mutation(api.home.dismissWelcome, { workspaceId: ctx.org.id }));
  revalidatePath("/app/home");
  return result;
}

/** Tomorrow at 8 AM in the workspace's time zone, only for this person's list. */
export async function snoozeWorkLeadAction(leadId: string): Promise<Result> {
  if (!UUID.test(leadId)) return { ok: false, error: "Not found." };
  const ctx = await getAuthContext();
  const today = localDate(new Date(), ctx.org.timezone);
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000);
  const [y, m, d] = localDate(tomorrow, ctx.org.timezone).split("-").map(Number);
  const { zonedStartOfDay } = await import("@/lib/home/periods");
  const until = zonedStartOfDay(ctx.org.timezone, y, m, d).getTime() + 8 * 3_600_000;
  const result = await quietly(async () => (await convex()).mutation(api.home.snoozeLead, { workspaceId: ctx.org.id, leadId, until }));
  revalidatePath("/app/home");
  revalidatePath("/app/today");
  return result;
}

export async function setAgenticHomeAction(enabled: boolean): Promise<Result> {
  const ctx = await getAuthContext();
  if (!ctx.isStaff) return { ok: false, error: "Only the Vistrial team can change this." };
  const result = await quietly(async () => (await convex()).mutation(api.home.setEnabled, { workspaceId: ctx.org.id, enabled }));
  revalidatePath("/app", "layout");
  return result;
}

export async function setOutcomeMetricsAction(metrics: string[]): Promise<Result> {
  const ctx = await getAuthContext();
  if (ctx.workspaceRole !== "owner" && !ctx.isStaff) return { ok: false, error: "Only an Owner can choose these." };
  const picked = [...new Set(metrics)].filter(isOutcomeMetric);
  if (picked.length < 1 || picked.length > 4) return { ok: false, error: "Pick between one and four numbers." };
  const result = await quietly(async () => (await convex()).mutation(api.home.setOutcomeMetrics, { workspaceId: ctx.org.id, metrics: picked }));
  revalidatePath("/app/home");
  return result;
}

/**
 * Asks Relay for a draft through the same database path Compass uses, with
 * its daily cap and do-not-contact refusal. The draft lands under Decisions
 * waiting; nothing is sent from here.
 */
export async function requestDraftAction(leadId: string): Promise<Result<{ message: string }>> {
  if (!UUID.test(leadId)) return { ok: false, error: "Not found." };
  const ctx = await getAuthContext();
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data, error } = await db.rpc("compass_request_draft", { p_org_id: ctx.org.id, p_lead_id: leadId });
  const result = data as { ok?: boolean; reason?: string } | null;
  if (error || !result?.ok) return { ok: false, error: result?.reason ?? "Relay cannot draft for this lead right now." };
  revalidatePath("/app/home");
  return { ok: true, data: { message: WORK_COPY.textDraftDone } };
}

export type WhyFirst = { tier: string; score: number; reasons: string[]; hidden: number };

export async function whyFirstAction(leadId: string): Promise<Result<WhyFirst>> {
  if (!UUID.test(leadId)) return { ok: false, error: "Not found." };
  const ctx = await getAuthContext();
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data, error } = await db.rpc("assay_lead_score", { p_org_id: ctx.org.id, p_lead_id: leadId });
  const view = error ? null : parseAssayScore(data);
  if (!view) return { ok: false, error: "No score for this lead yet." };
  return {
    ok: true,
    data: {
      tier: view.tier,
      score: view.score,
      reasons: [...view.raising].sort((a, b) => b.impact - a.impact).slice(0, 3).map((reason) => reason.text),
      hidden: view.hiddenCallReasons,
    },
  };
}

/** Command bar suggestions from the real state of the workspace. Read-only counts, no AI. */
export async function commandSuggestionsAction(): Promise<string[]> {
  const ctx = await getAuthContext();
  const { loadSuggestionFacts } = await import("@/lib/workspace/load");
  const { commandSuggestions } = await import("@/lib/workspace/voice");
  const { loadWaitingTotal } = await import("@/lib/agents/summary-load");
  const waiting = await loadWaitingTotal(ctx.org.id);
  const facts = await loadSuggestionFacts(ctx, waiting).catch(() => null);
  return facts ? commandSuggestions(facts) : [];
}

const RUN_COLUMNS =
  "id, org_id, agent_id, lead_id, actor_member_id, subject_label, subject_href, status, current_step_label, plan, reason_summary, plain_error, needs_person, sources, config_version, batch_id, simulated, trigger_key, created_at, started_at, finished_at, last_progress_at";

/** Older stream items, a page at a time, through the person's own row security. */
export async function loadEarlierRunsAction(beforeIso: string): Promise<Result<LiveRun[]>> {
  if (Number.isNaN(Date.parse(beforeIso))) return { ok: false, error: "Bad cursor." };
  const ctx = await getAuthContext();
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data, error } = await db
    .from("agent_activity_runs")
    .select(RUN_COLUMNS)
    .eq("org_id", ctx.org.id)
    .lt("created_at", beforeIso)
    .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return { ok: false, error: "Could not load earlier items." };
  return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(mapRun).filter((run): run is LiveRun => run !== null) };
}
